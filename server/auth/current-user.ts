import { and, eq, gt, isNull } from "drizzle-orm";
import type { Request } from "express";
import { getDatabase } from "../db/client";
import { authSessions, users } from "../db/schema";
import { getSessionToken, readSessionToken } from "./session";

export class PasswordChangeRequiredError extends Error {
  readonly status = 403;
  readonly code = "PASSWORD_CHANGE_REQUIRED";
  constructor() { super("Troque a senha inicial antes de acessar o sistema."); }
}

export async function getCurrentUser(req: Request, options: { allowPasswordChange?: boolean } = {}) {
  const token = getSessionToken(req);
  if (!token) return null;
  const session = await readSessionToken(token);
  if (!session) return null;
  const db = getDatabase();
  if (!db) return null;
  if(session.sessionId){const cutoff=new Date(Date.now()-60*60_000);
  const [active]=await db.select().from(authSessions).where(and(eq(authSessions.id,session.sessionId),eq(authSessions.userId,session.userId),isNull(authSessions.revokedAt),gt(authSessions.lastActivityAt,cutoff),gt(authSessions.expiresAt,new Date()))).limit(1);
  if(!active)return null;
  if(Date.now()-active.lastActivityAt.getTime()>60_000) await db.update(authSessions).set({lastActivityAt:new Date(),expiresAt:new Date(Date.now()+60*60_000)}).where(eq(authSessions.id,active.id));}
  const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  if (!user || user.status !== "active" || user.sessionVersion !== session.sessionVersion) return null;
  if (user.mustChangePassword && !options.allowPasswordChange) throw new PasswordChangeRequiredError();
  return user;
}
