import { and, asc, count, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import { z } from "zod";
import { quotaImportSchema, quotaInputSchema, quotaStatusSchema, quotaUpdateSchema, validateImportRows, type QuotaInput } from "../../shared/stock";
import { getCurrentUser } from "../auth/current-user";
import { getDatabase } from "../db/client";
import { quotas } from "../db/schema";

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

function insertValues(data: QuotaInput) {
  return {
    ...data,
    creditAmount: data.creditAmount.toFixed(2),
    entryAmount: data.entryAmount.toFixed(2),
    installmentAmount: data.installmentAmount.toFixed(2),
    outstandingBalance: data.outstandingBalance.toFixed(2),
  };
}

function updateValues(data: Partial<QuotaInput>) {
  return { ...data, creditAmount: data.creditAmount?.toFixed(2), entryAmount: data.entryAmount?.toFixed(2), installmentAmount: data.installmentAmount?.toFixed(2), outstandingBalance: data.outstandingBalance?.toFixed(2) };
}

stockRouter.get("/", asyncRoute(async (req, res) => {
  const current = await requireUser(req, res);
  if (!current) return;
  const db = getDatabase();
  if (!db) return res.status(503).json({ error: "Banco de dados não configurado" });
  const page = Math.max(1, Number(req.query.page) || 1);
  const requestedPageSize = Number(req.query.pageSize) || 20;
  const pageSize = [20, 50, 100].includes(requestedPageSize) ? requestedPageSize : 20;
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
  const [items, totalResult] = await Promise.all([
    db.select().from(quotas).where(where).orderBy(desc(quotas.featured), asc(quotas.creditAmount), asc(quotas.code)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ value: count() }).from(quotas).where(where),
  ]);
  const total = totalResult[0]?.value ?? 0;
  const canSeeSupplier = ["admin", "administrative", "advisor"].includes(current.role);
  return res.json({ items: items.map(item => canSeeSupplier ? item : { ...item, supplier: null }), page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
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

stockRouter.post("/import/preview", asyncRoute(async (req, res) => {
  if (!(await requireUser(req, res, true))) return;
  const input = quotaImportSchema.safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: input.error.issues[0]?.message ?? "Planilha inválida" });
  const results = validateImportRows(input.data.rows);
  return res.json({ rows: results, valid: results.filter(row => row.valid).length, invalid: results.filter(row => !row.valid).length });
}));

stockRouter.post("/import/commit", asyncRoute(async (req, res) => {
  if (!(await requireUser(req, res, true))) return;
  const input = quotaImportSchema.safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: input.error.issues[0]?.message ?? "Planilha inválida" });
  const results = validateImportRows(input.data.rows);
  if (results.some(row => !row.valid)) return res.status(400).json({ error: "Corrija as linhas inválidas antes de importar", rows: results });
  const validRows = results.flatMap(row => row.valid ? [insertValues(row.data)] : []);
  const db = getDatabase();
  if (!db) return res.status(503).json({ error: "Banco de dados não configurado" });
  if (input.data.mode === "replace") await db.delete(quotas);
  await db.insert(quotas).values(validRows).onConflictDoUpdate({
    target: quotas.code,
    set: { category: sql`excluded.category`, administrator: sql`excluded.administrator`, supplier: sql`excluded.supplier`, creditAmount: sql`excluded.credit_amount`, entryAmount: sql`excluded.entry_amount`, installmentCount: sql`excluded.installment_count`, installmentAmount: sql`excluded.installment_amount`, outstandingBalance: sql`excluded.outstanding_balance`, status: sql`excluded.status`, featured: sql`excluded.featured`, updatedAt: new Date() },
  });
  return res.json({ imported: validRows.length });
}));

stockRouter.delete("/:id", asyncRoute(async (req, res) => {
  if (!(await requireUser(req, res, true))) return;
  const db = getDatabase(); if (!db) return res.status(503).json({ error: "Banco de dados não configurado" });
  const [deleted] = await db.delete(quotas).where(eq(quotas.id, req.params.id)).returning({ id: quotas.id });
  if (!deleted) return res.status(404).json({ error: "Cota não encontrada" });
  return res.status(204).end();
}));

stockRouter.post("/smart-search", asyncRoute(async (req, res) => {
  const current = await requireUser(req, res); if (!current) return;
  const input = z.object({ administrator: z.string().min(1), category: z.string().min(1), targetCredit: z.number().positive(), priority: z.enum(["installment", "entry", "balance"]) }).safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: input.error.issues[0]?.message ?? "Busca inválida" });
  const db = getDatabase(); if (!db) return res.status(503).json({ error: "Banco de dados não configurado" });
  const candidates = await db.select().from(quotas).where(and(eq(quotas.status, "available"), eq(quotas.administrator, input.data.administrator), eq(quotas.category, input.data.category))).limit(5000);
  const key = input.data.priority === "installment" ? "installmentAmount" : input.data.priority === "entry" ? "entryAmount" : "outstandingBalance";
  const sorted = [...candidates].sort((a, b) => Number(a[key]) / Number(a.creditAmount) - Number(b[key]) / Number(b.creditAmount));
  const selected: typeof candidates = []; let total = 0;
  for (const item of sorted) { if (total >= input.data.targetCredit) break; selected.push(item); total += Number(item.creditAmount); }
  return res.json({ items: selected, creditTotal: total, difference: total - input.data.targetCredit });
}));

stockRouter.post("/", asyncRoute(async (req, res) => {
  if (!(await requireUser(req, res, true))) return;
  const parsed = quotaInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" });
  const db = getDatabase();
  if (!db) return res.status(503).json({ error: "Banco de dados não configurado" });
  try {
    const [created] = await db.insert(quotas).values(insertValues(parsed.data)).returning();
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
  const [updated] = await db.update(quotas).set({ ...updateValues(parsed.data), updatedAt: new Date() }).where(eq(quotas.id, id.data)).returning();
  if (!updated) return res.status(404).json({ error: "Cota não encontrada" });
  return res.json({ quota: updated });
}));
