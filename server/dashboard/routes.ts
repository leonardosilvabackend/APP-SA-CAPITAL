import { and, count, eq, sql } from "drizzle-orm";
import { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import { getCurrentUser } from "../auth/current-user";
import { getDatabase } from "../db/client";
import { quotas, savedQuotes, users } from "../db/schema";

export const dashboardRouter = Router();

function asyncRoute(handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => { void handler(req, res, next).catch(next); };
}

dashboardRouter.get("/metrics", asyncRoute(async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: "Faça login para continuar" });
  const db = getDatabase();
  if (!db) return res.status(503).json({ error: "Banco de dados não configurado" });

  const quoteVisibility = user.role === "admin" ? undefined : eq(savedQuotes.creatorId, user.id);
  const [stockResult, quoteResult, partnerResult] = await Promise.all([
    db.select({ availableQuotas: count(), availableCredit: sql<string>`coalesce(sum(${quotas.creditAmount}), 0)` }).from(quotas).where(eq(quotas.status, "available")),
    db.select({ savedQuotes: count() }).from(savedQuotes).where(quoteVisibility),
    db.select({ activePartners: count() }).from(users).where(and(eq(users.role, "partner"), eq(users.status, "active"))),
  ]);

  return res.json({
    availableQuotas: stockResult[0]?.availableQuotas ?? 0,
    availableCredit: Number(stockResult[0]?.availableCredit ?? 0),
    savedQuotes: quoteResult[0]?.savedQuotes ?? 0,
    activePartners: partnerResult[0]?.activePartners ?? 0,
  });
}));
