import { and, count, desc, eq, sql } from "drizzle-orm";
import { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import { getCurrentUser } from "../auth/current-user";
import { getDatabase } from "../db/client";
import { preAnalyses, quotas, reservationRequests, savedQuotes, users } from "../db/schema";

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
  const [stockResult, quoteResult, partnerResult, analysisResult, reservationResult] = await Promise.all([
    db.select({ availableQuotas: count(), availableCredit: sql<string>`coalesce(sum(${quotas.creditAmount}), 0)` }).from(quotas).where(eq(quotas.status, "available")),
    db.select({ savedQuotes: count() }).from(savedQuotes).where(quoteVisibility),
    db.select({ activePartners: count() }).from(users).where(and(eq(users.role, "advisor"), eq(users.status, "active"))),
    db.select({ value: count() }).from(preAnalyses),
    db.select({ value: count() }).from(reservationRequests).where(eq(reservationRequests.status, "pending")),
  ]);

  return res.json({
    availableQuotas: stockResult[0]?.availableQuotas ?? 0,
    availableCredit: Number(stockResult[0]?.availableCredit ?? 0),
    savedQuotes: quoteResult[0]?.savedQuotes ?? 0,
    activePartners: partnerResult[0]?.activePartners ?? 0,
    preAnalyses: analysisResult[0]?.value ?? 0,
    pendingReservations: reservationResult[0]?.value ?? 0,
  });
}));

dashboardRouter.get("/reservations", asyncRoute(async (req, res) => {
  const user = await getCurrentUser(req); if (!user || user.role !== "admin") return res.status(403).json({ error: "Acesso exclusivo do administrador" });
  const db = getDatabase(); if (!db) return res.status(503).json({ error: "Banco não configurado" });
  const items = await db.select({ id: reservationRequests.id, quoteId: reservationRequests.quoteId, clientName: savedQuotes.clientName, requesterName: users.name, createdAt: reservationRequests.createdAt }).from(reservationRequests).innerJoin(savedQuotes, eq(reservationRequests.quoteId, savedQuotes.id)).innerJoin(users, eq(reservationRequests.requesterId, users.id)).where(eq(reservationRequests.status, "pending")).orderBy(desc(reservationRequests.createdAt));
  return res.json({ items });
}));
