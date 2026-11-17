import { moneyCents, moneyNumber } from "../../shared/money";
import { shareSmartWork } from "./smart-capacity";
import { trackedFbSync, persistedFbStatus } from "./fb-monitor";
import { fbSyncStatus } from "./fb-scheduler";
import { committedQuota, lockStock } from "./protection";
import { and, asc, count, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import express, { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import { z } from "zod";
import { quotaImportSchema, quotaInputSchema, quotaStatusSchema, quotaUpdateSchema, smartSearchInputSchema, specificSearchInputSchema, validateImportRows, type QuotaInput } from "../../shared/stock";
import { getCurrentUser } from "../auth/current-user";
import { getDatabase } from "../db/client";
import { appSettings, notifications, quotas, retiredQuotaCodes, stockAlertPreferences, stockSearchWishes } from "../db/schema";
import { matchesStockAlert, matchNotificationText } from "./alerts";
import { notificationExpiry } from "../notifications/routes";
import { findSmartOptions } from "./smart-options";
import { FbSyncError, previewFbStockSync, syncFbStock } from "./fb-sync";
import { FB_SUPPLIER } from "./fb-sync";
import { saImportSourceKey, saImportValues } from "./sa-import";
import { cleanupExpiredStockReservations } from "./reservation-expiry";
import { notifySpecificWishes, sameSpecificWish } from "./specific-wishes";
import * as XLSX from "xlsx";
import { defaultIncomeDocuments, legalNotice } from "../../shared/business";

export const stockRouter = Router();

function asyncRoute(handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => { void handler(req, res, next).catch(next); };
}

async function requireUser(req: Request, res: Response, adminOnly = false) {
  const current = await getCurrentUser(req);
  if (!current) { res.status(401).json({ error: "Faça login para continuar" }); return null; }
  if (adminOnly && !["admin", "administrative"].includes(current.role)) { res.status(403).json({ error: "Acesso exclusivo para a equipe administrativa" }); return null; }
  return current;
}

export function canImportStock(role: string) { return ["admin", "advisor"].includes(role); }
async function fbApiOnline() {
  const db = getDatabase()!;
  await db.insert(appSettings).values({ id: "default", incomeDocuments: defaultIncomeDocuments, legalNotice }).onConflictDoNothing();
  const [settings] = await db.select({ online: appSettings.fbApiOnline }).from(appSettings).where(eq(appSettings.id, "default"));
  return settings?.online ?? true;
}
async function requireStockImporter(req: Request, res: Response) {
  const current = await requireUser(req, res);
  if (!current) return null;
  if (!canImportStock(current.role)) { res.status(403).json({ error: "Somente administrador e assessor podem importar o estoque SA" }); return null; }
  return current;
}

function insertValues(data: QuotaInput) {
  return {
    ...data,
    reservationOrigin: data.status === "reserved" ? "manual" : null,
    reservedAt: data.status === "reserved" ? new Date() : null,
    creditAmount: moneyNumber(moneyCents(data.creditAmount)).toFixed(2),
    entryAmount: moneyNumber(moneyCents(data.entryAmount)).toFixed(2),
    installmentAmount: moneyNumber(moneyCents(data.installmentAmount)).toFixed(2),
    outstandingBalance: moneyNumber(moneyCents(data.outstandingBalance)).toFixed(2),
  };
}

function updateValues(data: Partial<QuotaInput>) {
  return { ...data, ...(data.status ? { reservationOrigin: data.status === "reserved" ? "manual" : null, reservedAt: data.status === "reserved" ? new Date() : null } : {}), creditAmount: data.creditAmount === undefined ? undefined : moneyNumber(moneyCents(data.creditAmount)).toFixed(2), entryAmount: data.entryAmount === undefined ? undefined : moneyNumber(moneyCents(data.entryAmount)).toFixed(2), installmentAmount: data.installmentAmount === undefined ? undefined : moneyNumber(moneyCents(data.installmentAmount)).toFixed(2), outstandingBalance: data.outstandingBalance === undefined ? undefined : moneyNumber(moneyCents(data.outstandingBalance)).toFixed(2) };
}

stockRouter.use("/import", asyncRoute(async (req, res, next) => { if (await requireStockImporter(req, res)) next(); }), express.json({ limit: "10mb" }));
stockRouter.use(express.json({ limit: "2mb" }));

stockRouter.get("/", asyncRoute(async (req, res) => {
  const current = await requireUser(req, res);
  if (!current) return;
  const db = getDatabase();
  if (!db) return res.status(503).json({ error: "Banco de dados não configurado" });
  const page = Math.max(1, Number(req.query.page) || 1);
  const requestedPageSize = Number(req.query.pageSize) || 100;
  const pageSize = [20, 50, 100, 5000].includes(requestedPageSize) ? requestedPageSize : 100;
  const conditions: SQL[] = [];
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const category = typeof req.query.category === "string" ? req.query.category.trim() : "";
  const administrator = typeof req.query.administrator === "string" ? req.query.administrator.trim() : "";
  const requestedStatus = quotaStatusSchema.safeParse(req.query.status);
  const pastedCodes = search.split(/[\s,;]+/).map(value => value.trim()).filter(Boolean);
  if (pastedCodes.length > 1) conditions.push(inArray(quotas.code, pastedCodes));
  else if (search) conditions.push(or(ilike(quotas.code, `%${search}%`), ilike(quotas.category, `%${search}%`), ilike(quotas.administrator, `%${search}%`))!);
  if (category) conditions.push(eq(quotas.category, category));
  if (administrator) conditions.push(eq(quotas.administrator, administrator));
  if (!["admin", "administrative"].includes(current.role)) conditions.push(eq(quotas.status, "available"));
  else if (requestedStatus.success) conditions.push(eq(quotas.status, requestedStatus.data));
  const where = conditions.length ? and(...conditions) : undefined;
  const entryPercent = sql`${quotas.entryAmount} / nullif(${quotas.creditAmount}, 0)`;
  const sortOrders: Record<string, SQL> = {
    credit_asc: asc(quotas.creditAmount), credit_desc: desc(quotas.creditAmount),
    entry_percent_asc: sql`${entryPercent} asc nulls last`,
    entry_percent_desc: sql`${entryPercent} desc nulls last`,
    entry_asc: asc(quotas.entryAmount), entry_desc: desc(quotas.entryAmount),
    installment_asc: asc(quotas.installmentAmount), installment_desc: desc(quotas.installmentAmount),
    term_asc: asc(quotas.installmentCount), term_desc: desc(quotas.installmentCount),
    balance_asc: asc(quotas.outstandingBalance), balance_desc: desc(quotas.outstandingBalance),
  };
  const sort = typeof req.query.sort === "string" && Object.hasOwn(sortOrders, req.query.sort) ? sortOrders[req.query.sort] : undefined;
  const categoryRank = sql`case when lower(${quotas.category}) like 'veículo%' or lower(${quotas.category}) like 'veiculo%' then 0 when lower(${quotas.category}) like 'imóve%' or lower(${quotas.category}) like 'imove%' then 1 else 2 end`;
  const order = sort ? [sort, asc(quotas.code), asc(quotas.id)] : [categoryRank, asc(quotas.category), asc(quotas.creditAmount), asc(quotas.code), asc(quotas.id)];
  const [items, totalResult] = await Promise.all([
    db.select().from(quotas).where(where).orderBy(...order).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ value: count() }).from(quotas).where(where),
  ]);
  const total = totalResult[0]?.value ?? 0;
  const [preference] = await db.select().from(stockAlertPreferences).where(and(eq(stockAlertPreferences.userId, current.id), eq(stockAlertPreferences.active, true))).limit(1);
  const canSeeSupplier = ["admin", "administrative", "advisor"].includes(current.role);
  const visible = items.map(item => { const alertMatch = preference ? matchesStockAlert(preference, item) : false; return { ...(canSeeSupplier ? item : { ...item, supplier: null }), featured: item.featured || alertMatch, alertMatch }; });
  visible.sort((a, b) => Number(b.alertMatch) - Number(a.alertMatch));
  return res.json({ items: visible, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
}));

stockRouter.get("/filters", asyncRoute(async (req, res) => {
  const current = await requireUser(req, res);
  if (!current) return;
  const db = getDatabase();
  if (!db) return res.status(503).json({ error: "Banco de dados não configurado" });
  const visibility = !["admin", "administrative"].includes(current.role) ? eq(quotas.status, "available") : undefined;
  const [categories, administrators] = await Promise.all([
    db.selectDistinct({ value: quotas.category }).from(quotas).where(visibility).orderBy(asc(quotas.category)),
    db.selectDistinct({ value: quotas.administrator }).from(quotas).where(visibility).orderBy(asc(quotas.administrator)),
  ]);
  return res.json({ categories: categories.map(item => item.value), administrators: administrators.map(item => item.value) });
}));

stockRouter.get("/export-sa", asyncRoute(async (req, res) => {
  if (!(await requireStockImporter(req, res))) return;
  // The download uses persisted FB values; it never calls/reprices the API.
  const rows = await getDatabase()!.select().from(quotas).orderBy(asc(quotas.code));
  const sheet = XLSX.utils.json_to_sheet(rows.map(item => ({
    "ID interno": item.id,
    "Cód.Cota original": item.externalId ?? item.code,
    "Código SA": item.code,
    Categoria: item.category,
    Crédito: Number(item.creditAmount),
    Entrada: Number(item.entryAmount),
    "NºParcelas": item.installmentCount,
    VlrParcela: Number(item.installmentAmount),
    Saldodevedor: Number(item.outstandingBalance),
    Administradora: item.administrator,
    Fornecedor: item.supplier ?? "",
    Situação: item.status,
    "Origem da reserva": item.reservationOrigin ?? "",
    Destaque: item.featured ? "Sim" : "Não",
    "Criada em": item.createdAt,
    "Atualizada em": item.updatedAt,
  })));
  const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, sheet, "Estoque SA");
  const file = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="estoque-sa-${new Date().toISOString().slice(0, 10)}.xlsx"`);
  return res.send(file);
}));

stockRouter.get("/export", asyncRoute(async (req, res) => {
  if (!(await requireUser(req, res))) return;
  const rate = Number(req.query.commission ?? 0); if (!Number.isInteger(rate) || rate < 0 || rate > 8) return res.status(400).json({ error: "Comissão deve ser de 1% a 8%, ou 0%" });
  const rows = await getDatabase()!.select().from(quotas).where(eq(quotas.status, "available")).orderBy(asc(quotas.code));
  const sheet = XLSX.utils.json_to_sheet(rows.map(item => ({ "Código SA": item.code, Categoria: item.category, Crédito: Number(item.creditAmount), Entrada: Number(item.entryAmount) + Number(item.creditAmount) * rate / 100, Prazo: item.installmentCount, Parcela: Number(item.installmentAmount), "Saldo devedor": Number(item.outstandingBalance), Administradora: item.administrator })));
  const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, sheet, "Estoque"); const file = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"); res.setHeader("Content-Disposition", `attachment; filename="estoque-${new Date().toISOString().slice(0, 10)}.xlsx"`); return res.send(file);
}));

stockRouter.post("/import/preview", asyncRoute(async (req, res) => {
  if (!(await requireUser(req, res, true))) return;
  const input = quotaImportSchema.safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: input.error.issues[0]?.message ?? "Planilha inválida" });
  const results = validateImportRows(input.data.rows);
  for (const row of results) if (row.valid && row.data.supplier === FB_SUPPLIER) return res.status(400).json({ error: "Cotas da Fraga & Bitello devem ser atualizadas pela API FB" });
  return res.json({ rows: results, valid: results.filter(row => row.valid).length, invalid: results.filter(row => !row.valid).length });
}));

stockRouter.post("/import/commit", asyncRoute(async (req, res) => {
  if (!(await requireUser(req, res, true))) return;
  const input = quotaImportSchema.safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: input.error.issues[0]?.message ?? "Planilha inválida" });
  const results = validateImportRows(input.data.rows);
  if (results.some(row => !row.valid)) return res.status(400).json({ error: "Corrija as linhas inválidas antes de importar", rows: results });
  const validRows = results.flatMap(row => row.valid ? [saImportValues(row.data)] : []);
  if (validRows.some(row => row.supplier === FB_SUPPLIER)) return res.status(400).json({ error: "Cotas da Fraga & Bitello devem ser atualizadas pela API FB" });
  const db = getDatabase();
  if (!db) return res.status(503).json({ error: "Banco de dados não configurado" });
  await cleanupExpiredStockReservations();
  const summary = await db.transaction(async tx => {
    await lockStock(tx);
    // Repair active links before replacing: imports must never release an active negotiation.
    await tx.update(quotas).set({ status: "reserved", reservationOrigin: "negotiation", reservedAt: sql`coalesce(${quotas.reservedAt}, now())` }).where(and(committedQuota(), sql`${quotas.status} <> 'sold'`));
    const local = await tx.select({ id: quotas.id, code: quotas.code, externalId: quotas.externalId, supplier: quotas.supplier, status: quotas.status, protected: sql<boolean>`${committedQuota()}` }).from(quotas);
    const imported = new Map<string, typeof local[number]>();
    for (const item of local) if (item.externalId && item.supplier !== FB_SUPPLIER) {
      const key = saImportSourceKey(item.supplier, item.externalId);
      if (imported.has(key)) throw new Error(`Referência de origem duplicada no estoque: ${item.externalId}`);
      imported.set(key, item);
    }
    const incomingKeys = new Set(validRows.map(row => saImportSourceKey(row.supplier, row.sourceCode)));
    const incomingLegacyCodes = new Set(validRows.map(row => row.sourceCode.trim().toLocaleLowerCase("pt-BR")));
    const legacyByCode = new Map(local.filter(item => item.supplier !== FB_SUPPLIER && !item.externalId).map(item => [item.code.toLocaleLowerCase("pt-BR"), item]));
    if (input.data.mode === "replace") {
      const preserveFb = await fbApiOnline();
      const removable = local.filter(item => (!preserveFb || item.supplier !== FB_SUPPLIER) && item.status === "available" && !item.protected && (item.supplier === FB_SUPPLIER || (item.externalId ? !incomingKeys.has(saImportSourceKey(item.supplier, item.externalId)) : !incomingLegacyCodes.has(item.code.toLocaleLowerCase("pt-BR")))));
      for (let offset = 0; offset < removable.length; offset += 500) await tx.delete(quotas).where(inArray(quotas.id, removable.slice(offset, offset + 500).map(item => item.id)));
    }
    const retired = await tx.select({ code: retiredQuotaCodes.code }).from(retiredQuotaCodes);
    const sixDigitCodes = [...local.map(item => item.code), ...retired.map(item => item.code)].filter(code => /^\d{6}$/.test(code));
    let nextCode = sixDigitCodes.reduce((largest, code) => Math.max(largest, Number(code)), sixDigitCodes.length ? 0 : 99999);
    const creates: (ReturnType<typeof insertValues> & { externalId: string })[] = [];
    let updated = 0, protectedCount = 0;
    for (const row of validRows) {
      const existing = imported.get(saImportSourceKey(row.supplier, row.sourceCode)) ?? legacyByCode.get(row.sourceCode.toLocaleLowerCase("pt-BR"));
      const { sourceCode, code: _sourceCodeField, ...values } = row;
      if (existing) {
        if (existing.protected || existing.status !== "available") { protectedCount++; continue; }
        await tx.update(quotas).set({ ...values, externalId: sourceCode, updatedAt: new Date() }).where(and(eq(quotas.id, existing.id), eq(quotas.status, "available"), sql`not ${committedQuota()}`));
        updated++; continue;
      }
      if (++nextCode > 999999) throw new Error("A sequência de códigos SA ultrapassou 999999");
      creates.push({ ...values, code: String(nextCode).padStart(6, "0"), externalId: sourceCode });
    }
    for (let offset = 0; offset < creates.length; offset += 100) await tx.insert(quotas).values(creates.slice(offset, offset + 100));
    if (creates.length) {
      const preferences = await tx.select().from(stockAlertPreferences).where(eq(stockAlertPreferences.active, true));
      for (const preference of preferences) { const count = creates.filter(item => matchesStockAlert(preference, { ...item, status: "available" })).length; if (count) await tx.insert(notifications).values({ recipientId: preference.userId, title: "Novas cotas para você", message: matchNotificationText(count), link: "/estoque", expiresAt: notificationExpiry() }); }
    }
    await notifySpecificWishes(tx, creates.map(item => ({ ...item, status: "available" })));
    return { created: creates.length, updated, protected: protectedCount };
  });
  return res.json({ imported: validRows.length, ...summary });
}));

stockRouter.delete("/:id", asyncRoute(async (req, res) => {
  if (!(await requireUser(req, res, true))) return;
  const db = getDatabase(); if (!db) return res.status(503).json({ error: "Banco de dados não configurado" });
  const [deleted] = await db.delete(quotas).where(and(eq(quotas.id, req.params.id), sql`${quotas.status} <> 'reserved'`, sql`not ${committedQuota()}`)).returning({ id: quotas.id });
  if (!deleted) return res.status(404).json({ error: "Cota não encontrada" });
  return res.status(204).end();
}));

stockRouter.post("/smart-search", asyncRoute(async (req, res) => {
  const deadline = Date.now() + 15_000;
  const current = await requireUser(req, res); if (!current) return;
  const input = smartSearchInputSchema.safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: input.error.issues[0]?.message ?? "Busca inválida" });
  const db = getDatabase(); if (!db) return res.status(503).json({ error: "Banco de dados não configurado" });
  const conditions = [eq(quotas.status, "available"), eq(quotas.category, input.data.category),
    sql`${quotas.creditAmount} > 0`,
    sql`${quotas.creditAmount} <= ${input.data.targetCredit}::numeric * 1.02`];
  if (input.data.administrator) conditions.push(eq(quotas.administrator, input.data.administrator));
  const task = shareSmartWork(JSON.stringify(input.data), async () => {
    const candidates = await db.select().from(quotas).where(and(...conditions));
    return findSmartOptions(candidates, input.data, { maxMs: Math.max(0,deadline-Date.now()-100) });
  });
  if (!task) { res.setHeader("Retry-After", "2"); return res.status(429).json({ error: "Pedido Inteligente ocupado. Tente novamente em alguns segundos." }); }
  const result = await task;
  const canSeeSupplier = ["admin", "administrative", "advisor"].includes(current.role);
  const visible = (item: typeof quotas.$inferSelect) => canSeeSupplier ? item : { ...item, supplier: null };
  return res.json({ ...result, items: result.items.map(visible), options: result.options.map(option => ({ ...option, items: option.items.map(visible) })) });
}));
stockRouter.post("/smart-search/legacy",asyncRoute(async(req,res)=>{const current=await requireUser(req,res);if(!current)return;const input=smartSearchInputSchema.safeParse(req.body);if(!input.success)return res.status(400).json({error:input.error.issues[0]?.message});const candidates=await getDatabase()!.select().from(quotas).where(eq(quotas.status,"available"));const {findSmartCombination}=await import("./smart-search");const result=await findSmartCombination(candidates,input.data,{maxMs:1500,maxNodes:250000});return res.json({...result,options:result.summary?[{kind:"primary",criterion:result.priority,items:result.items,matchesRequest:true,summary:{...result.summary,balanceDifference:result.summary.balanceTotal-result.summary.creditTotal}}]:[]})}));
stockRouter.post("/smart-search/specific", asyncRoute(async (req, res) => {
  const current = await requireUser(req, res); if (!current) return;
  const parsed = specificSearchInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const v = parsed.data, db = getDatabase()!;
  const conditions = [eq(quotas.status, "available"), eq(quotas.administrator, v.administrator), eq(quotas.category, v.category)];
  if (v.targetCredit) conditions.push(sql`${quotas.creditAmount} <= ${v.targetCredit * 1.02}`);
  const candidates = await db.select().from(quotas).where(and(...conditions));
  let items: typeof candidates = [], summary: { creditTotal: number; entryTotal: number; installmentTotal: number; balanceTotal: number } | null = null;
  const withinLimits = (value: typeof summary) => Boolean(value && (v.maxEntry == null || value.entryTotal <= v.maxEntry) && (v.maxInstallment == null || value.installmentTotal <= v.maxInstallment) && (v.maxBalance == null || value.balanceTotal <= v.maxBalance));
  if (v.targetCredit) {
    const priorities = [...new Set([v.maxEntry != null ? "entry" : null, v.maxInstallment != null ? "installment" : null, v.maxBalance != null ? "balance" : null, "entry"].filter(Boolean))] as ("entry" | "installment" | "balance")[];
    const { findSmartCombination } = await import("./smart-search");
    for (const priority of priorities) {
      const result = await findSmartCombination(candidates, { administrator: v.administrator, category: v.category, targetCredit: v.targetCredit, priority }, { maxMs: 10_000, maxNodes: 2_000_000, maxEntry: v.maxEntry, maxInstallment: v.maxInstallment, maxBalance: v.maxBalance });
      if (withinLimits(result.summary)) { items = result.items; summary = result.summary; break; }
    }
  } else {
    items = candidates.filter(item => (v.maxEntry == null || Number(item.entryAmount) <= v.maxEntry) && (v.maxInstallment == null || Number(item.installmentAmount) <= v.maxInstallment) && (v.maxBalance == null || Number(item.outstandingBalance) <= v.maxBalance)).slice(0, 20);
    if (items.length) summary = { creditTotal: items.reduce((sum, item) => sum + Number(item.creditAmount), 0), entryTotal: items.reduce((sum, item) => sum + Number(item.entryAmount), 0), installmentTotal: items.reduce((sum, item) => sum + Number(item.installmentAmount), 0), balanceTotal: items.reduce((sum, item) => sum + Number(item.outstandingBalance), 0) };
  }
  if (!items.length) {
    const values = { userId: current.id, ...v, targetCredit: v.targetCredit?.toFixed(2), maxEntry: v.maxEntry?.toFixed(2), maxInstallment: v.maxInstallment?.toFixed(2), maxBalance: v.maxBalance?.toFixed(2) };
    const existing = await db.select().from(stockSearchWishes).where(and(eq(stockSearchWishes.userId, current.id), eq(stockSearchWishes.active, true)));
    if (!existing.some(item => sameSpecificWish(item, values))) await db.insert(stockSearchWishes).values(values);
    return res.status(201).json({ items: [], summary: null, savedWish: true });
  }
  return res.json({ items, summary, savedWish: false });
}));
stockRouter.get("/sync-fb/status", asyncRoute(async (req, res) => {
  if (!(await requireUser(req, res, true))) return;
  res.json({ ...fbSyncStatus(), ...await persistedFbStatus(), apiOnline: await fbApiOnline() });
}));

stockRouter.patch("/sync-fb/mode", asyncRoute(async (req, res) => {
  const user = await requireUser(req, res, true);
  if (!user) return;
  const parsed = z.object({ online: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Informe o estado da API FB" });
  const db = getDatabase()!;
  await db.insert(appSettings).values({ id: "default", incomeDocuments: defaultIncomeDocuments, legalNotice }).onConflictDoNothing();
  const [settings] = await db.update(appSettings).set({ fbApiOnline: parsed.data.online, updatedAt: new Date() }).where(eq(appSettings.id, "default")).returning({ apiOnline: appSettings.fbApiOnline });
  return res.json(settings);
}));

stockRouter.post("/sync-fb", asyncRoute(async (req, res) => {
  if (!(await requireUser(req, res, true))) return;
  try {
    const result = await trackedFbSync("manual");
    return res.json({ success: true, message: "Estoque da Fraga & Bitello sincronizado com sucesso.", ...result });
  } catch (error) {
    if (error instanceof FbSyncError) return res.status(error.status).json({ error: error.message });
    throw error;
  }
}));
stockRouter.post("/sync-fb/preview", asyncRoute(async (req, res) => {
  if (!(await requireUser(req, res, true))) return;
  try {
    return res.json(await previewFbStockSync());
  } catch (error) {
    if (error instanceof FbSyncError) return res.status(error.status).json({ error: error.message });
    throw error;
  }
}));
stockRouter.post("/", asyncRoute(async (req, res) => {
  if (!(await requireUser(req, res, true))) return;
  const parsed = quotaInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" });
  const db = getDatabase();
  if (!db) return res.status(503).json({ error: "Banco de dados não configurado" });
  try {
    const [created] = await db.insert(quotas).values(insertValues(parsed.data)).returning();
    await notifySpecificWishes(db, [created]);
    return res.status(201).json({ quota: created });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "23505") return res.status(409).json({ error: "Já existe uma cota com este código" });
    throw error;
  }
}));

stockRouter.patch("/:id", asyncRoute(async (req, res) => {
  if (!(await requireUser(req, res, true))) return;
  const id = z.string().uuid().safeParse(req.params.id);
  const parsed = quotaUpdateSchema.safeParse(req.body);
  if (!id.success) return res.status(400).json({ error: "Identificador inválido" });
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" });
  const db = getDatabase();
  if (!db) return res.status(503).json({ error: "Banco de dados não configurado" });
  const updated = await db.transaction(async tx => {
    await lockStock(tx);
    return (await tx.update(quotas).set({ ...updateValues(parsed.data), updatedAt: new Date() }).where(and(eq(quotas.id, id.data), sql`not ${committedQuota()}`)).returning())[0];
  });
  if (!updated) return res.status(409).json({ error: "Cota não encontrada ou vinculada a negociação. Cancele a negociação para liberar a cota." });
  return res.json({ quota: updated });
}));
