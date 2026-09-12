import { and, desc, eq, gt, isNull, lt, or } from "drizzle-orm";
import { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import { getCurrentUser } from "../auth/current-user";
import { getDatabase } from "../db/client";
import { notifications } from "../db/schema";

export const notificationsRouter = Router();
const asyncRoute = (handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler => (req, res, next) => { void handler(req, res, next).catch(next); };
export const notificationExpiry = () => new Date(Date.now() + 48 * 60 * 60 * 1000);
export const cleanupExpiredNotifications = async () => { const db = getDatabase(); if (db) await db.delete(notifications).where(lt(notifications.expiresAt, new Date())); };

notificationsRouter.get("/", asyncRoute(async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: "Faça login para continuar" });
  const items = await getDatabase()!.select().from(notifications).where(and(gt(notifications.expiresAt, new Date()), or(eq(notifications.recipientId, user.id), eq(notifications.audienceRole, user.role), and(isNull(notifications.recipientId), isNull(notifications.audienceRole))))).orderBy(desc(notifications.createdAt)).limit(50);
  return res.json({ items });
}));
