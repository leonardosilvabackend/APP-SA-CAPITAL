import { and, desc, eq, inArray } from "drizzle-orm";
import { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import { z } from "zod";
import { calculateQuote, commercialQuoteText, quoteCalculationInputSchema, type CalculationQuota } from "../../shared/quote";
import { getCurrentUser } from "../auth/current-user";
import { getDatabase } from "../db/client";
import { quotas, savedQuotes, users } from "../db/schema";

export const quotesRouter = Router();
function asyncRoute(handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler { return (req, res, next) => { void handler(req, res, next).catch(next); }; }

async function loadAvailableQuotas(quotaIds: string[]) {
  const db = getDatabase()!;
  const records = await db.select().from(quotas).where(and(inArray(quotas.id, quotaIds), eq(quotas.status, "available")));
  if (records.length !== quotaIds.length) return null;
  return quotaIds.map(id => records.find(quota => quota.id === id)!).map((quota): CalculationQuota => ({ id: quota.id, code: quota.code, category: quota.category, administrator: quota.administrator, creditAmount: quota.creditAmount, entryAmount: quota.entryAmount, installmentCount: quota.installmentCount, installmentAmount: quota.installmentAmount, outstandingBalance: quota.outstandingBalance }));
}

quotesRouter.post("/calculate", asyncRoute(async (req, res) => {
  if (!(await getCurrentUser(req))) return res.status(401).json({ error: "Faça login para continuar" });
  const parsed = quoteCalculationInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" });
  if (!getDatabase()) return res.status(503).json({ error: "Banco de dados não configurado" });
  const items = await loadAvailableQuotas(parsed.data.quotaIds);
  if (!items) return res.status(400).json({ error: "Uma ou mais cotas não estão disponíveis" });
  return res.json({ quotas: items, summary: calculateQuote(items, parsed.data.commissionRate), commercialText: commercialQuoteText(items, parsed.data.commissionRate) });
}));

const saveSchema = quoteCalculationInputSchema.extend({ clientName: z.string().trim().min(2, "Informe o nome do cliente").max(180) });
quotesRouter.post("/saved", asyncRoute(async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: "Faça login para continuar" });
  const parsed = saveSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" });
  const db = getDatabase();
  if (!db) return res.status(503).json({ error: "Banco de dados não configurado" });
  const items = await loadAvailableQuotas(parsed.data.quotaIds);
  if (!items) return res.status(400).json({ error: "Uma ou mais cotas não estão disponíveis" });
  const [saved] = await db.insert(savedQuotes).values({ clientName: parsed.data.clientName, creatorId: user.id, selectedQuotas: items, commissionRate: String(parsed.data.commissionRate) }).returning();
  return res.status(201).json({ item: saved });
}));

quotesRouter.get("/saved", asyncRoute(async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: "Faça login para continuar" });
  const db = getDatabase();
  if (!db) return res.status(503).json({ error: "Banco de dados não configurado" });
  const fields = { id: savedQuotes.id, clientName: savedQuotes.clientName, creatorId: savedQuotes.creatorId, creatorName: users.name, selectedQuotas: savedQuotes.selectedQuotas, commissionRate: savedQuotes.commissionRate, createdAt: savedQuotes.createdAt };
  const base = db.select(fields).from(savedQuotes).innerJoin(users, eq(savedQuotes.creatorId, users.id));
  const rows = user.role === "admin" ? await base.orderBy(desc(savedQuotes.createdAt)) : await base.where(eq(savedQuotes.creatorId, user.id)).orderBy(desc(savedQuotes.createdAt));
  return res.json({ items: rows.map(row => ({ ...row, summary: calculateQuote(row.selectedQuotas, Number(row.commissionRate)) })) });
}));

quotesRouter.get("/saved/:id", asyncRoute(async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: "Faça login para continuar" });
  if (!z.string().uuid().safeParse(req.params.id).success) return res.status(400).json({ error: "Cotação inválida" });
  const db = getDatabase();
  if (!db) return res.status(503).json({ error: "Banco de dados não configurado" });
  const condition = user.role === "admin" ? eq(savedQuotes.id, req.params.id) : and(eq(savedQuotes.id, req.params.id), eq(savedQuotes.creatorId, user.id));
  const [row] = await db.select({ id: savedQuotes.id, clientName: savedQuotes.clientName, creatorId: savedQuotes.creatorId, creatorName: users.name, selectedQuotas: savedQuotes.selectedQuotas, commissionRate: savedQuotes.commissionRate, createdAt: savedQuotes.createdAt }).from(savedQuotes).innerJoin(users, eq(savedQuotes.creatorId, users.id)).where(condition).limit(1);
  if (!row) return res.status(404).json({ error: "Cotação não encontrada" });
  const rate = Number(row.commissionRate);
  return res.json({ item: { ...row, quotas: row.selectedQuotas, summary: calculateQuote(row.selectedQuotas, rate), commercialText: commercialQuoteText(row.selectedQuotas, rate) } });
}));
