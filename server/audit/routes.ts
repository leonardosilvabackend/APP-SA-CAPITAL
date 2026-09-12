import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import { getCurrentUser } from "../auth/current-user";
import { getDatabase } from "../db/client";
import { auditEvents, users } from "../db/schema";
import { pageResult, pagination } from "../pagination";

export const auditRouter = Router();
const asyncRoute = (handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler => (req, res, next) => { void handler(req, res, next).catch(next); };

auditRouter.get("/", asyncRoute(async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: "Faça login para continuar" });
  if (user.role !== "admin") return res.status(403).json({ error: "Acesso restrito à administração" });
  const paging = pagination(req);
  const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 80) : "";
  const action = typeof req.query.action === "string" ? req.query.action.trim().slice(0, 80) : "";
  const searchFilter = search ? or(ilike(auditEvents.action, `%${search}%`), ilike(users.name, `%${search}%`), ilike(sql`${auditEvents.entityId}::text`, `%${search}%`)) : undefined;
  let query = getDatabase()!.select({ id: auditEvents.id, action: auditEvents.action, entityId: auditEvents.entityId, details: auditEvents.details, createdAt: auditEvents.createdAt, actor: { id: users.id, name: users.name } }).from(auditEvents).leftJoin(users, eq(users.id, auditEvents.actorId)).$dynamic();
  const filters = [action ? eq(auditEvents.action, action) : undefined, searchFilter].filter((filter): filter is NonNullable<typeof filter> => Boolean(filter));
  if (filters.length) query = query.where(and(...filters));
  const rows = await query.orderBy(desc(auditEvents.createdAt), desc(auditEvents.id)).limit(paging.pageSize + 1).offset(paging.offset);
  return res.json(pageResult(rows, paging));
}));
