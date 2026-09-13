import { eq } from "drizzle-orm";
import type { Request } from "express";
import { getDatabase } from "../db/client";
import { users } from "../db/schema";
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
  const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  if (!user || user.status !== "active" || user.sessionVersion !== session.sessionVersion) return null;
  if (user.mustChangePassword && !options.allowPasswordChange) throw new PasswordChangeRequiredError();
  return user;
}
