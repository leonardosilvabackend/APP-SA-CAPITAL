import { pagination, pageResult } from "../pagination";
import { committedQuota, lockStock, type StockTransaction } from "../stock/protection";
import { ownershipScope } from "../auth/ownership";
import { and, desc, eq, gt, inArray, lt, or, sql } from "drizzle-orm";
import { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import { z } from "zod";
import { calculateQuote, commercialQuoteText, quoteCalculationInputSchema, type CalculationQuota } from "../../shared/quote";
import { getCurrentUser } from "../auth/current-user";
import { getDatabase } from "../db/client";
import { notifications, quotas, reservationRequests, savedQuotes, users } from "../db/schema";
import { notificationExpiry } from "../notifications/routes";

import { NegotiationError, reviewReservation } from "../negotiations/service";

export const quotesRouter = Router();
function asyncRoute(handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler { return (req, res, next) => { void handler(req, res, next).catch(next); }; }
export async function cleanupExpiredQuotes() { const db = getDatabase(); if (db) await db.delete(savedQuotes).where(lt(savedQuotes.expiresAt, new Date())); }
async function cleanup() { return cleanupExpiredQuotes(); }
function canUseQuotes(role: string) { return ["admin", "advisor", "user", "partner"].includes(role); }
async function current(req: Request, res: Response) { const user = await getCurrentUser(req); if (!user) { res.status(401).json({ error: "Faça login para continuar" }); return null; } if (!canUseQuotes(user.role)) { res.status(403).json({ error: "Seu perfil não acessa cotações" }); return null; } return user; }
function quoteScope(user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>) { return ownershipScope(savedQuotes.creatorId, user); }
type QuoteDatabase = NonNullable<ReturnType<typeof getDatabase>> | StockTransaction;
async function stockWarnings(selected: CalculationQuota[], db: QuoteDatabase = getDatabase()!, cached?: { id: string; code: string; status: string; committed: unknown }[]) {
  if (!selected.length) return [];
  const stock = cached ?? await db.select({ id: quotas.id, code: quotas.code, status: quotas.status, committed: committedQuota() }).from(quotas).where(or(inArray(quotas.id, selected.map(quota => quota.id)), inArray(quotas.code, selected.map(quota => quota.code))));
  return selected.flatMap(quota => {
    const current = stock.find(row => row.id === quota.id) ?? stock.find(row => row.code === quota.code);
    return !current ? [`Cota ${quota.code} indisponível`] : current.status !== "available" || current.committed ? [`Cota ${quota.code} reservada${current.status === "sold" ? " (finalizada)" : ""}`] : current.id !== quota.id ? [`Cota ${quota.code} indisponível nesta cotação; gere uma nova cotação`] : [];
  });
}
async function loadAvailableQuotas(quotaIds: string[], db: QuoteDatabase = getDatabase()!) {
  const records = await db.select().from(quotas).where(inArray(quotas.id, quotaIds));
  if (records.length !== quotaIds.length) throw new Error("Uma ou mais cotas estão indisponíveis no estoque");
  const warnings = await stockWarnings(records, db);
  if (warnings.length) throw new Error(warnings.join("; "));
  const ordered = quotaIds.map(id => records.find(q => q.id === id)!);
  if (new Set(ordered.map(q => q.administrator)).size > 1 || new Set(ordered.map(q => q.category)).size > 1) throw new Error("Não é permitido combinar administradoras ou categorias diferentes");
  return ordered.map((q): CalculationQuota => ({ id:q.id, code:q.code, category:q.category, administrator:q.administrator, creditAmount:q.creditAmount, entryAmount:q.entryAmount, installmentCount:q.installmentCount, installmentAmount:q.installmentAmount, outstandingBalance:q.outstandingBalance }));
}

quotesRouter.post("/calculate", asyncRoute(async (req,res) => { if (!(await current(req,res))) return; const parsed=quoteCalculationInputSchema.safeParse(req.body); if(!parsed.success)return res.status(400).json({error:parsed.error.issues[0]?.message}); if(!getDatabase())return res.status(503).json({error:"Banco não configurado"}); try { const items=await loadAvailableQuotas(parsed.data.quotaIds); if(!items)return res.status(400).json({error:"Uma ou mais cotas não estão disponíveis"}); return res.json({quotas:items,summary:calculateQuote(items,parsed.data.commissionRate),commercialText:commercialQuoteText(items,parsed.data.commissionRate)}); } catch(error){return res.status(400).json({error:(error as Error).message});} }));
const saveSchema=quoteCalculationInputSchema.extend({clientName:z.string().trim().min(2).max(180)});
quotesRouter.post("/saved",asyncRoute(async(req,res)=>{const user=await current(req,res);if(!user)return;const parsed=saveSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:parsed.error.issues[0]?.message});const db=getDatabase();if(!db)return res.status(503).json({error:"Banco não configurado"});try{const items=await loadAvailableQuotas(parsed.data.quotaIds);if(!items)return res.status(400).json({error:"Cota indisponível"});const [item]=await db.insert(savedQuotes).values({clientName:parsed.data.clientName,creatorId:user.id,selectedQuotas:items,commissionRate:String(parsed.data.commissionRate),expiresAt:new Date(Date.now()+5*86400000)}).returning();return res.status(201).json({item});}catch(error){return res.status(400).json({error:(error as Error).message});}}));
quotesRouter.get("/saved", asyncRoute(async (req, res) => {
  const user = await current(req, res); if (!user) return;
  const db = getDatabase()!, paging = pagination(req);
  const rows = await db.select({ id: savedQuotes.id, clientName: savedQuotes.clientName, creatorId: savedQuotes.creatorId, creatorName: users.name, selectedQuotas: savedQuotes.selectedQuotas, commissionRate: savedQuotes.commissionRate, createdAt: savedQuotes.createdAt, expiresAt: savedQuotes.expiresAt })
    .from(savedQuotes).innerJoin(users, eq(savedQuotes.creatorId, users.id)).where(quoteScope(user)).orderBy(desc(savedQuotes.createdAt), desc(savedQuotes.id)).limit(paging.pageSize + 1).offset(paging.offset);
  const page = pageResult(rows, paging);
  const selected = page.items.flatMap(row => row.selectedQuotas);
  const [reservations, stock] = await Promise.all([
    page.items.length ? db.select().from(reservationRequests).where(inArray(reservationRequests.quoteId, page.items.map(row => row.id))).orderBy(desc(reservationRequests.createdAt)) : [],
    selected.length ? db.select({ id: quotas.id, code: quotas.code, status: quotas.status, committed: committedQuota() }).from(quotas).where(or(inArray(quotas.id, [...new Set(selected.map(q => q.id))]), inArray(quotas.code, [...new Set(selected.map(q => q.code))]))) : [],
  ]);
  const byQuote = new Map<string, typeof reservations[number]>();
  for (const reservation of reservations) if (!byQuote.has(reservation.quoteId)) byQuote.set(reservation.quoteId, reservation);
  return res.json({ ...page, items: await Promise.all(page.items.map(async row => ({ ...row, warnings: await stockWarnings(row.selectedQuotas, db, stock), summary: calculateQuote(row.selectedQuotas, Number(row.commissionRate)), reservation: byQuote.get(row.id) ?? null }))) });
}));
quotesRouter.get("/opportunities", asyncRoute(async (req, res) => {
  if (!(await current(req, res))) return;
  const db = getDatabase()!;
  const rows = await db.select().from(savedQuotes).where(and(eq(savedQuotes.opportunityActive, true), gt(savedQuotes.expiresAt, new Date()))).orderBy(desc(savedQuotes.createdAt)).limit(20);
  const items = [];
  for (const row of rows) {
    const warnings = await stockWarnings(row.selectedQuotas, db);
    if (warnings.length) { await db.update(savedQuotes).set({ opportunityActive: false }).where(eq(savedQuotes.id, row.id)); continue; }
    items.push({ id: row.id, reason: row.opportunityReason, quotas: row.selectedQuotas, summary: calculateQuote(row.selectedQuotas, Number(row.commissionRate)) });
  }
  return res.json({ items });
}));
quotesRouter.post("/saved/:id/opportunity", asyncRoute(async (req, res) => {
  const user = await current(req, res); if (!user) return;
  if (!["admin", "advisor"].includes(user.role)) return res.status(403).json({ error: "Somente administrador e assessor podem criar oportunidades" });
  const parsed = z.object({ reason: z.string().trim().min(4).max(300) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Informe por que esta cotação é uma oportunidade" });
  const db = getDatabase()!;
  const condition = and(eq(savedQuotes.id, req.params.id), quoteScope(user));
  const [quote] = await db.select().from(savedQuotes).where(condition);
  if (!quote) return res.status(404).json({ error: "Cotação não encontrada" });
  const warnings = await stockWarnings(quote.selectedQuotas, db);
  if (warnings.length) return res.status(409).json({ error: warnings.join("; ") });
  const [item] = await db.update(savedQuotes).set({ opportunityActive: true, opportunityReason: parsed.data.reason }).where(condition).returning();
  return res.json({ item });
}));
quotesRouter.get("/saved/:id",asyncRoute(async(req,res)=>{const user=await current(req,res);if(!user)return;const db=getDatabase()!;const scope=quoteScope(user);const condition=scope?and(eq(savedQuotes.id,req.params.id),scope):eq(savedQuotes.id,req.params.id);const [row]=await db.select({id:savedQuotes.id,clientName:savedQuotes.clientName,creatorId:savedQuotes.creatorId,creatorName:users.name,selectedQuotas:savedQuotes.selectedQuotas,commissionRate:savedQuotes.commissionRate,createdAt:savedQuotes.createdAt,expiresAt:savedQuotes.expiresAt}).from(savedQuotes).innerJoin(users,eq(savedQuotes.creatorId,users.id)).where(condition).limit(1);if(!row)return res.status(404).json({error:"Cotação não encontrada"});const [reservation]=await db.select().from(reservationRequests).where(eq(reservationRequests.quoteId,row.id)).orderBy(desc(reservationRequests.createdAt)).limit(1);const rate=Number(row.commissionRate);return res.json({item:{...row,warnings:await stockWarnings(row.selectedQuotas),quotas:row.selectedQuotas,summary:calculateQuote(row.selectedQuotas,rate),commercialText:commercialQuoteText(row.selectedQuotas,rate),reservation:reservation??null}});}));
quotesRouter.patch("/saved/:id", asyncRoute(async (req, res) => {
  const user = await current(req, res); if (!user) return;
  const parsed = saveSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  try {
    const item = await getDatabase()!.transaction(async tx => {
      await lockStock(tx);
      const condition = and(eq(savedQuotes.id, req.params.id), quoteScope(user));
      const [existing] = await tx.select().from(savedQuotes).where(condition).for("update");
      if (!existing) throw new NegotiationError(404, "Cotação não encontrada");
      if (existing.expiresAt <= new Date()) throw new NegotiationError(409, "Cotação expirada");
      const warnings = await stockWarnings(existing.selectedQuotas, tx);
      if (warnings.length) throw new NegotiationError(409, warnings.join("; "));
      const changes = { clientName: parsed.data.clientName, commissionRate: parsed.data.commissionRate === undefined ? undefined : String(parsed.data.commissionRate), selectedQuotas: parsed.data.quotaIds ? await loadAvailableQuotas(parsed.data.quotaIds, tx) : undefined };
      return (await tx.update(savedQuotes).set(changes).where(condition).returning())[0];
    });
    return res.json({ item });
  } catch (error) { return res.status(error instanceof NegotiationError ? error.status : 400).json({ error: (error as Error).message }); }
}));
quotesRouter.post("/saved/:id/selection", asyncRoute(async (req, res) => {
  const user = await current(req, res); if (!user) return;
  const [item] = await getDatabase()!.select().from(savedQuotes).where(and(eq(savedQuotes.id, req.params.id), quoteScope(user)));
  if (!item) return res.status(404).json({ error: "Cotação não encontrada" });
  if (item.expiresAt <= new Date()) return res.status(409).json({ error: "Cotação expirada" });
  const warnings = await stockWarnings(item.selectedQuotas);
  if (warnings.length) return res.status(409).json({ error: warnings.join("; "), warnings });
  return res.json({ quotaIds: item.selectedQuotas.map(quota => quota.id) });
}));
quotesRouter.delete("/saved/:id",asyncRoute(async(req,res)=>{const user=await current(req,res);if(!user)return;const db=getDatabase()!;const scope=quoteScope(user);const condition=scope?and(eq(savedQuotes.id,req.params.id),scope):eq(savedQuotes.id,req.params.id);const [item]=await db.delete(savedQuotes).where(condition).returning({id:savedQuotes.id});if(!item)return res.status(404).json({error:"Cotação não encontrada"});return res.status(204).end();}));
quotesRouter.post("/saved/:id/reserve", asyncRoute(async (req, res) => {
  const user = await current(req, res); if (!user) return;
  const db = getDatabase()!;
  const result = await db.transaction(async tx => {
    await lockStock(tx);
    const scope = quoteScope(user);
    const [quote] = await tx.select({ item: savedQuotes }).from(savedQuotes).innerJoin(users, eq(savedQuotes.creatorId, users.id))
      .where(and(eq(savedQuotes.id, req.params.id), scope)).for("update", { of: savedQuotes });
    if (!quote) return { status: 404, body: { error: "Cotacao nao encontrada" } };
    if (quote.item.expiresAt <= new Date()) return { status: 409, body: { error: "A cotacao expirou" } };
    const warnings = await stockWarnings(quote.item.selectedQuotas, tx);
    if (warnings.length) return { status: 409, body: { error: warnings.join("; ") } };
    const [existing] = await tx.select().from(reservationRequests).where(eq(reservationRequests.quoteId, quote.item.id)).orderBy(desc(reservationRequests.createdAt));
    if (existing && !["rejected", "cancelled"].includes(existing.status)) return { status: 200, body: { item: existing } };
    const [item] = await tx.insert(reservationRequests).values({ quoteId: quote.item.id, requesterId: user.id }).returning();
    const message = `${user.name} solicitou a reserva das cotas ${quote.item.selectedQuotas.map(quota => quota.code).join(", ")}.`;
    const advisorId = user.role === "advisor" ? user.id : user.managerId;
    await tx.insert(notifications).values([
      ...(advisorId ? [{ recipientId: advisorId, title: "Nova solicitação de reserva", message, link: `/cotacoes?id=${quote.item.id}`, expiresAt: notificationExpiry() }] : []),
      { audienceRole: "admin", title: "Nova solicitação de reserva", message, link: `/cotacoes?id=${quote.item.id}`, expiresAt: notificationExpiry() },
    ]);
    return { status: 201, body: { item } };
  });
  return res.status(result.status).json(result.body);
}));
quotesRouter.patch("/reservations/:id", asyncRoute(async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user || user.role !== "admin") return res.status(403).json({ error: "Apenas o administrador aprova reservas" });
  const parsed = z.object({ status: z.enum(["approved", "rejected"]) }).safeParse(req.body);
  if (!parsed.success || !z.string().uuid().safeParse(req.params.id).success) return res.status(400).json({ error: "Dados invalidos" });
  try { return res.json(await reviewReservation(req.params.id, parsed.data.status, user.id)); }
  catch (error) { if (error instanceof NegotiationError) return res.status(error.status).json({ error: error.message }); throw error; }
}));
