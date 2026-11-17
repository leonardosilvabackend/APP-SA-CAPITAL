import { createHash } from "node:crypto";
import { and, asc, count, eq, ilike, isNull } from "drizzle-orm";
import { Router } from "express";
import { getDatabase } from "./db/client";
import { partnerApiKeys, partnerApiLogs, quotas, users } from "./db/schema";
import { consumePersistentLimit } from "./auth/rate-limit";
export const partnerApiRouter = Router();
const hash = (v: string) => createHash("sha256").update(v).digest("hex");
partnerApiRouter.use(async (req, res, next) => {
  try {
  res.setHeader("Cache-Control", "no-store");
  const token = req.headers.authorization?.match(/^Bearer (sa_(?:test|live)_[A-Za-z0-9_-]+)$/)?.[1];
  if (!token) return res.status(401).json({ error: "Bearer token inválido" });
  const db = getDatabase()!; const [record] = await db.select({ key: partnerApiKeys }).from(partnerApiKeys).innerJoin(users, eq(users.id, partnerApiKeys.userId)).where(and(eq(partnerApiKeys.tokenHash, hash(token)), isNull(partnerApiKeys.revokedAt), eq(users.status, "active"))).limit(1);
  const key = record?.key;
  if (!key) return res.status(401).json({ error: "Chave inválida ou revogada" });
  const allowed = await consumePersistentLimit(`partner-api:${key.id}`, 60, 60_000);
  if (!allowed) res.setHeader("Retry-After", "60");
  if (!allowed) { await db.insert(partnerApiLogs).values({ apiKeyId: key.id, path: req.path.slice(0, 200), statusCode: 429 }); return res.status(429).json({ error: "Limite de 60 requisições por minuto excedido" }); }
  res.locals.partnerKey = key; res.on("finish", () => { void db.insert(partnerApiLogs).values({ apiKeyId: key.id, path: req.path.slice(0, 200), statusCode: res.statusCode }).then(() => undefined).catch(() => console.error("[Partner API] Usage log write failed")); });
  await db.update(partnerApiKeys).set({ lastUsedAt: new Date() }).where(eq(partnerApiKeys.id, key.id)); next();
  } catch (error) { next(error); }
});
export const publicQuota = (q: typeof quotas.$inferSelect, rate: number) => ({ code: q.code, category: q.category, credit: Number(q.creditAmount), entry: Number(q.entryAmount) + Number(q.creditAmount) * rate / 100, term: q.installmentCount, installment: Number(q.installmentAmount), outstandingBalance: Number(q.outstandingBalance), administrator: q.administrator });
partnerApiRouter.get("/stock", async (req, res, next) => { try { const page = Math.max(1, Number(req.query.page) || 1), pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20)); const conditions = [eq(quotas.status, "available")]; if (typeof req.query.category === "string") conditions.push(ilike(quotas.category, req.query.category)); if (typeof req.query.administrator === "string") conditions.push(ilike(quotas.administrator, req.query.administrator)); const where = and(...conditions); const db = getDatabase()!; const [items, total] = await Promise.all([db.select().from(quotas).where(where).orderBy(asc(quotas.creditAmount), asc(quotas.code)).limit(pageSize).offset((page - 1) * pageSize), db.select({ value: count() }).from(quotas).where(where)]); res.json({ items: items.map(q => publicQuota(q, res.locals.partnerKey.commissionRate)), page, pageSize, total: total[0]?.value ?? 0 }); } catch (e) { next(e); } });
partnerApiRouter.get("/stock/:code", async (req, res, next) => { try { const [item] = await getDatabase()!.select().from(quotas).where(and(eq(quotas.status, "available"), eq(quotas.code, req.params.code))).limit(1); if (!item) return res.status(404).json({ error: "Cota não encontrada" }); return res.json({ item: publicQuota(item, res.locals.partnerKey.commissionRate) }); } catch (e) { next(e); } });
