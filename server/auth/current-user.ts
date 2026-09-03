import { eq } from "drizzle-orm";
import type { Request } from "express";
import { getDatabase } from "../db/client";
import { users } from "../db/schema";
import { getSessionToken, readSessionToken } from "./session";

export async function getCurrentUser(req: Request) {
  const token = getSessionToken(req);
  if (!token) return null;
  const session = await readSessionToken(token);
  if (!session) return null;
  const db = getDatabase();
  if (!db) return null;
  const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  if (!user || user.status !== "active" || user.sessionVersion !== session.sessionVersion) return null;
  return user;
}
