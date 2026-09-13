import { createHash } from "node:crypto";
import type { Request, Response } from "express";
import { lt, sql } from "drizzle-orm";
import { getDatabase } from "../db/client";
import { authRateLimits } from "../db/schema";

// Bounded per-process protection. Account keys are hashed and no credentials are logged.
const entries = new Map<string, { count: number; expiresAt: number }>();
const WINDOW = 15 * 60_000;
export function consumeLimit(key: string, maximum: number, now = Date.now()) {
  for (const [id, entry] of entries) if (entry.expiresAt <= now) entries.delete(id);
  const entry = entries.get(key);
  if (!entry && entries.size >= 10_000) return false; // Fail closed under key flooding.
  const current = entry ?? { count: 0, expiresAt: now + WINDOW };
  current.count++;
  entries.set(key, current);
  return current.count <= maximum;
}
let nextCleanup = 0;
export async function consumePersistentLimit(key: string, maximum: number) {
  const db = getDatabase()!;
  const hash = createHash("sha256").update(key).digest("hex");
  const [row] = await db.insert(authRateLimits).values({ key: hash, attempts: 1, expiresAt: new Date(Date.now() + WINDOW) }).onConflictDoUpdate({
    target: authRateLimits.key,
    set: {
      attempts: sql`case when ${authRateLimits.expiresAt} <= now() then 1 else ${authRateLimits.attempts} + 1 end`,
      expiresAt: sql`case when ${authRateLimits.expiresAt} <= now() then now() + interval '15 minutes' else ${authRateLimits.expiresAt} end`,
    },
  }).returning({ attempts: authRateLimits.attempts });
  if (Date.now() >= nextCleanup) {
    nextCleanup = Date.now() + WINDOW;
    await db.delete(authRateLimits).where(lt(authRateLimits.expiresAt, new Date()));
  }
  return row.attempts <= maximum;
}
export async function guardAuthRate(req: Request, res: Response, action: string, accountLimit = 10) {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const account = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const accountKey = createHash("sha256").update(account).digest("hex");
  if (!consumeLimit(`${action}:ip:${ip}`, 500)) {
    res.status(429).json({ error: "Muitas tentativas. Aguarde alguns minutos." });
    return false;
  }
  const allowedIp = await consumePersistentLimit(`${action}:ip:${ip}`, 500);
  const allowedAccount = !account || await consumePersistentLimit(`${action}:account:${accountKey}`, accountLimit);
  if (allowedIp && allowedAccount) return true;
  res.setHeader("Retry-After", "900");
  res.status(429).json({ error: "Muitas tentativas. Aguarde alguns minutos." });
  return false;
}
