import { and, desc, eq, inArray, lt, or } from "drizzle-orm";
import { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import { z } from "zod";
import { calculateQuote, commercialQuoteText, quoteCalculationInputSchema, type CalculationQuota } from "../../shared/quote";
import { getCurrentUser } from "../auth/current-user";
import { getDatabase } from "../db/client";
import { quotas, reservationRequests, savedQuotes, users } from "../db/schema";

import { NegotiationError, reviewReservation } from "../negotiations/service";

export const quotesRouter = Router();
function asyncRoute(handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler { return (req, res, next) => { void handler(req, res, next).catch(next); }; }
export async function cleanupExpiredQuotes() { const db = getDatabase(); if (db) await db.delete(savedQuotes).where(lt(savedQuotes.expiresAt, new Date())); }
async function cleanup() { return cleanupExpiredQuotes(); }
function canUseQuotes(role: string) { return ["admin", "advisor", "user", "partner"].includes(role); }
async function current(req: Request, res: Response) { const user = await getCurrentUser(req); if (!user) { res.status(401).json({ error: "Faça login para continuar" }); return null; } if (!canUseQuotes(user.role)) { res.status(403).json({ error: "Seu perfil não acessa cotações" }); return null; } return user; }
function quoteScope(user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>) { return user.role === "admin" ? undefined : user.role === "advisor" ? or(eq(savedQuotes.creatorId, user.id), eq(users.managerId, user.id)) : eq(savedQuotes.creatorId, user.id); }
async function loadAvailableQuotas(quotaIds: string[]) { const db = getDatabase()!; const records = await db.select().from(quotas).where(and(inArray(quotas.id, quotaIds), eq(quotas.status, "available"))); if (records.length !== quotaIds.length) return null; const ordered = quotaIds.map(id => records.find(q => q.id === id)!); if (new Set(ordered.map(q => q.administrator)).size > 1 || new Set(ordered.map(q => q.category)).size > 1) throw new Error("Não é permitido combinar administradoras ou categorias diferentes"); return ordered.map((q): CalculationQuota => ({ id:q.id, code:q.code, category:q.category, administrator:q.administrator, creditAmount:q.creditAmount, entryAmount:q.entryAmount, installmentCount:q.installmentCount, installmentAmount:q.installmentAmount, outstandingBalance:q.outstandingBalance })); }

quotesRouter.post("/calculate", asyncRoute(async (req,res) => { if (!(await current(req,res))) return; const parsed=quoteCalculationInputSchema.safeParse(req.body); if(!parsed.success)return res.status(400).json({error:parsed.error.issues[0]?.message}); if(!getDatabase())return res.status(503).json({error:"Banco não configurado"}); try { const items=await loadAvailableQuotas(parsed.data.quotaIds); if(!items)return res.status(400).json({error:"Uma ou mais cotas não estão disponíveis"}); return res.json({quotas:items,summary:calculateQuote(items,parsed.data.commissionRate),commercialText:commercialQuoteText(items,parsed.data.commissionRate)}); } catch(error){return res.status(400).json({error:(error as Error).message});} }));
const saveSchema=quoteCalculationInputSchema.extend({clientName:z.string().trim().min(2).max(180)});
quotesRouter.post("/saved",asyncRoute(async(req,res)=>{const user=await current(req,res);if(!user)return;const parsed=saveSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:parsed.error.issues[0]?.message});const db=getDatabase();if(!db)return res.status(503).json({error:"Banco não configurado"});try{const items=await loadAvailableQuotas(parsed.data.quotaIds);if(!items)return res.status(400).json({error:"Cota indisponível"});const [item]=await db.insert(savedQuotes).values({clientName:parsed.data.clientName,creatorId:user.id,selectedQuotas:items,commissionRate:String(parsed.data.commissionRate),expiresAt:new Date(Date.now()+5*86400000)}).returning();return res.status(201).json({item});}catch(error){return res.status(400).json({error:(error as Error).message});}}));
quotesRouter.get("/saved",asyncRoute(async(req,res)=>{const user=await current(req,res);if(!user)return;await cleanup();const db=getDatabase()!;const fields={id:savedQuotes.id,clientName:savedQuotes.clientName,creatorId:savedQuotes.creatorId,creatorName:users.name,selectedQuotas:savedQuotes.selectedQuotas,commissionRate:savedQuotes.commissionRate,createdAt:savedQuotes.createdAt,expiresAt:savedQuotes.expiresAt};const base=db.select(fields).from(savedQuotes).innerJoin(users,eq(savedQuotes.creatorId,users.id));const scope=quoteScope(user);const rows=scope?await base.where(scope).orderBy(desc(savedQuotes.createdAt)):await base.orderBy(desc(savedQuotes.createdAt));const reservations=rows.length?await db.select().from(reservationRequests).where(inArray(reservationRequests.quoteId,rows.map(r=>r.id))):[];return res.json({items:rows.map(row=>({...row,summary:calculateQuote(row.selectedQuotas,Number(row.commissionRate)),reservation:reservations.find(r=>r.quoteId===row.id)??null}))});}));
quotesRouter.get("/saved/:id",asyncRoute(async(req,res)=>{const user=await current(req,res);if(!user)return;await cleanup();const db=getDatabase()!;const scope=quoteScope(user);const condition=scope?and(eq(savedQuotes.id,req.params.id),scope):eq(savedQuotes.id,req.params.id);const [row]=await db.select({id:savedQuotes.id,clientName:savedQuotes.clientName,creatorId:savedQuotes.creatorId,creatorName:users.name,selectedQuotas:savedQuotes.selectedQuotas,commissionRate:savedQuotes.commissionRate,createdAt:savedQuotes.createdAt,expiresAt:savedQuotes.expiresAt}).from(savedQuotes).innerJoin(users,eq(savedQuotes.creatorId,users.id)).where(condition).limit(1);if(!row)return res.status(404).json({error:"Cotação não encontrada"});const [reservation]=await db.select().from(reservationRequests).where(eq(reservationRequests.quoteId,row.id)).limit(1);const rate=Number(row.commissionRate);return res.json({item:{...row,quotas:row.selectedQuotas,summary:calculateQuote(row.selectedQuotas,rate),commercialText:commercialQuoteText(row.selectedQuotas,rate),reservation:reservation??null}});}));
quotesRouter.patch("/saved/:id",asyncRoute(async(req,res)=>{const user=await current(req,res);if(!user)return;const parsed=saveSchema.partial().safeParse(req.body);if(!parsed.success)return res.status(400).json({error:parsed.error.issues[0]?.message});const db=getDatabase()!;const scope=quoteScope(user);const condition=scope?and(eq(savedQuotes.id,req.params.id),scope):eq(savedQuotes.id,req.params.id);const values:any={};if(parsed.data.clientName)values.clientName=parsed.data.clientName;if(parsed.data.commissionRate!==undefined)values.commissionRate=String(parsed.data.commissionRate);if(parsed.data.quotaIds){try{const items=await loadAvailableQuotas(parsed.data.quotaIds);if(!items)return res.status(400).json({error:"Cota indisponível"});values.selectedQuotas=items;}catch(error){return res.status(400).json({error:(error as Error).message});}}const [item]=await db.update(savedQuotes).set(values).where(condition).returning();if(!item)return res.status(404).json({error:"Cotação não encontrada"});return res.json({item});}));
quotesRouter.delete("/saved/:id",asyncRoute(async(req,res)=>{const user=await current(req,res);if(!user)return;const db=getDatabase()!;const scope=quoteScope(user);const condition=scope?and(eq(savedQuotes.id,req.params.id),scope):eq(savedQuotes.id,req.params.id);const [item]=await db.delete(savedQuotes).where(condition).returning({id:savedQuotes.id});if(!item)return res.status(404).json({error:"Cotação não encontrada"});return res.status(204).end();}));
quotesRouter.post("/saved/:id/reserve", asyncRoute(async (req, res) => {
  const user = await current(req, res); if (!user) return;
  const db = getDatabase()!;
  const result = await db.transaction(async tx => {
    const scope = quoteScope(user);
    const [quote] = await tx.select({ item: savedQuotes }).from(savedQuotes).innerJoin(users, eq(savedQuotes.creatorId, users.id))
      .where(and(eq(savedQuotes.id, req.params.id), scope)).for("update", { of: savedQuotes });
    if (!quote) return { status: 404, body: { error: "Cotacao nao encontrada" } };
    if (quote.item.expiresAt <= new Date()) return { status: 409, body: { error: "A cotacao expirou" } };
    const [existing] = await tx.select().from(reservationRequests).where(eq(reservationRequests.quoteId, quote.item.id)).orderBy(desc(reservationRequests.createdAt));
    if (existing && existing.status !== "rejected") return { status: 200, body: { item: existing } };
    const [item] = await tx.insert(reservationRequests).values({ quoteId: quote.item.id, requesterId: user.id }).returning();
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
