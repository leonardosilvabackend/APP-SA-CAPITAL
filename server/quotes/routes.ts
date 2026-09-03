import { and, eq, inArray } from "drizzle-orm";
import { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import { calculateQuote, commercialQuoteText, quoteCalculationInputSchema, type CalculationQuota } from "../../shared/quote";
import { getCurrentUser } from "../auth/current-user";
import { getDatabase } from "../db/client";
import { quotas } from "../db/schema";

export const quotesRouter = Router();

function asyncRoute(handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => { void handler(req, res, next).catch(next); };
}

quotesRouter.post("/calculate", asyncRoute(async (req, res) => {
  if (!(await getCurrentUser(req))) return res.status(401).json({ error: "Faça login para continuar" });
  const parsed = quoteCalculationInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" });
  const db = getDatabase();
  if (!db) return res.status(503).json({ error: "Banco de dados não configurado" });
  const records = await db.select().from(quotas).where(and(inArray(quotas.id, parsed.data.quotaIds), eq(quotas.status, "available")));
  if (records.length !== parsed.data.quotaIds.length) return res.status(400).json({ error: "Uma ou mais cotas não estão disponíveis" });
  const ordered = parsed.data.quotaIds.map(id => records.find(quota => quota.id === id)!);
  const calculationQuotas: CalculationQuota[] = ordered.map(quota => ({
    id: quota.id, code: quota.code, category: quota.category, administrator: quota.administrator,
    creditAmount: quota.creditAmount, entryAmount: quota.entryAmount, installmentCount: quota.installmentCount,
    installmentAmount: quota.installmentAmount, outstandingBalance: quota.outstandingBalance,
  }));
  return res.json({ quotas: calculationQuotas, summary: calculateQuote(calculationQuotas, parsed.data.commissionRate), commercialText: commercialQuoteText(calculationQuotas, parsed.data.commissionRate) });
}));
