import { ownershipScope } from "../auth/ownership";
import { and, count, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import { getCurrentUser } from "../auth/current-user";
import { getDatabase } from "../db/client";
import { authSessions, preAnalyses, quotas, reservationRequests, savedQuotes, users } from "../db/schema";

export const dashboardRouter = Router();

function asyncRoute(handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => { void handler(req, res, next).catch(next); };
}

dashboardRouter.get("/metrics", asyncRoute(async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: "Faça login para continuar" });
  const db = getDatabase();
  if (!db) return res.status(503).json({ error: "Banco de dados não configurado" });

  const quoteVisibility = ownershipScope(savedQuotes.creatorId, user);
  const [stockResult, quoteResult, partnerResult, analysisResult, reservationResult] = await Promise.all([
    db.select({ availableQuotas: count(), availableCredit: sql<string>`coalesce(sum(${quotas.creditAmount}), 0)` }).from(quotas).where(eq(quotas.status, "available")),
    db.select({ savedQuotes: count() }).from(savedQuotes).where(quoteVisibility),
    db.select({ activePartners: count() }).from(users).where(and(
      user.role === "admin" ? eq(users.role, "advisor") : ownershipScope(users.id, user),
      eq(users.status, "active"),
      sql`exists (
        select 1 from ${authSessions}
        where ${authSessions.userId} = ${users.id}
          and ${isNull(authSessions.revokedAt)}
          and ${gt(authSessions.lastActivityAt, new Date(Date.now() - 60 * 60_000))}
          and ${gt(authSessions.expiresAt, new Date())}
      )`,
    )),
    db.select({ value: count() }).from(preAnalyses).where(ownershipScope(preAnalyses.partnerId, user, true)),
    db.select({ value: count() }).from(reservationRequests).where(and(eq(reservationRequests.status, "pending"), ownershipScope(reservationRequests.requesterId, user))),
  ]);

  return res.json({
    ...(user.role !== "user" ? { availableQuotas: stockResult[0]?.availableQuotas ?? 0 } : {}),
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

dashboardRouter.get("/credit-by-administrator", asyncRoute(async (req, res) => {
  const user = await getCurrentUser(req); if (!user) return res.status(401).json({ error: "Faça login" });
  const rows = await getDatabase()!.select({ administrator: quotas.administrator, category: quotas.category, credit: sql<string>`sum(${quotas.creditAmount})` }).from(quotas).where(eq(quotas.status, "available")).groupBy(quotas.administrator, quotas.category).orderBy(quotas.administrator, quotas.category);
  const grouped = new Map<string, { administrator: string; total: number; categories: { category: string; credit: number }[] }>();
  for (const row of rows) { const item = grouped.get(row.administrator) ?? { administrator: row.administrator, total: 0, categories: [] }; const credit = Number(row.credit); item.total += credit; item.categories.push({ category: row.category, credit }); grouped.set(row.administrator, item); }
  return res.json({ items: [...grouped.values()] });
}));
