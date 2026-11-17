import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { getDatabase } from "../db/client";
import { quotas, retiredQuotaCodes } from "../db/schema";
import { committedQuota, lockStock } from "./protection";

export const RESERVATION_TTL_MS = 3 * 24 * 60 * 60 * 1000;

export async function cleanupExpiredStockReservations(now = new Date()) {
  const db = getDatabase();
  const cutoff = new Date(now.getTime() - RESERVATION_TTL_MS);
  const expiredCondition = () => and(eq(quotas.status, "reserved"), lt(quotas.reservedAt, cutoff), sql`not ${committedQuota()}`);
  const [due] = await db.select({ id: quotas.id }).from(quotas).where(expiredCondition()).limit(1);
  if (!due) return [];
  return db.transaction(async tx => {
    await lockStock(tx);
    const expired = await tx.select({ id: quotas.id, code: quotas.code, supplier: quotas.supplier, externalId: quotas.externalId }).from(quotas).where(expiredCondition());
    if (expired.length) await tx.insert(retiredQuotaCodes).values(expired.map(item => ({ code: item.code, supplier: item.supplier, externalId: item.externalId }))).onConflictDoNothing();
    const removed = expired.length ? await tx.delete(quotas).where(inArray(quotas.id, expired.map(item => item.id))).returning({ id: quotas.id, code: quotas.code, externalId: quotas.externalId }) : [];
    if (removed.length) console.log(JSON.stringify({ event: "expired_stock_reservations_cleaned", count: removed.length, cutoff: cutoff.toISOString() }));
    return removed;
  });
}
