import { notifications, stockSearchWishes } from "../db/schema";
import { notificationExpiry } from "../notifications/routes";

type Wish = typeof stockSearchWishes.$inferSelect;
type IncomingQuota = { code: string; administrator: string; category: string; creditAmount: string | number; entryAmount: string | number; installmentAmount: string | number; installmentCount: number; outstandingBalance: string | number; status?: string };

export function matchesSpecificWish(wish: Wish, quota: IncomingQuota) {
  if (quota.status && quota.status !== "available") return false;
  if (wish.administrator !== quota.administrator || wish.category !== quota.category) return false;
  const credit = Number(quota.creditAmount);
  if (wish.targetCredit != null && (credit < Number(wish.targetCredit) * .98 || credit > Number(wish.targetCredit) * 1.02)) return false;
  if (wish.maxEntry != null && Number(quota.entryAmount) > Number(wish.maxEntry)) return false;
  if (wish.maxInstallment != null && Number(quota.installmentAmount) > Number(wish.maxInstallment)) return false;
  if (wish.minTerm != null && quota.installmentCount < wish.minTerm) return false;
  if (wish.maxTerm != null && quota.installmentCount > wish.maxTerm) return false;
  if (wish.maxBalance != null && Number(quota.outstandingBalance) > Number(wish.maxBalance)) return false;
  return true;
}

export async function notifySpecificWishes(db: any, incoming: IncomingQuota[]) {
  const available = incoming.filter(item => !item.status || item.status === "available");
  if (!available.length) return 0;
  const wishes: Wish[] = (await db.select().from(stockSearchWishes)).filter((wish: Wish) => wish.active === true && Boolean(wish.userId));
  const candidates = wishes.flatMap(wish => available.filter(quota => matchesSpecificWish(wish, quota)).map(quota => ({ wish, quota, key: `stock-wish:${wish.id}:${quota.code}` })));
  if (!candidates.length) return 0;
  const existing: { dedupeKey: string | null }[] = await db.select().from(notifications);
  const known = new Set(existing.flatMap(item => item.dedupeKey ? [item.dedupeKey] : []));
  const fresh = candidates.filter(item => !known.has(item.key));
  if (fresh.length) await db.insert(notifications).values(fresh.map(({ wish, quota, key }) => ({ recipientId: wish.userId, dedupeKey: key, title: "Encontramos a cota que você pediu", message: `${quota.administrator} • ${quota.category} • cota ${quota.code}`, link: "/estoque", expiresAt: notificationExpiry() })));
  return fresh.length;
}

export function sameSpecificWish(a: Partial<Wish>, b: Partial<Wish>) {
  if (a.administrator !== b.administrator || a.category !== b.category) return false;
  const keys: (keyof Wish)[] = ["targetCredit", "maxEntry", "maxInstallment", "minTerm", "maxTerm", "maxBalance"];
  return keys.every(key => (a[key] == null ? null : Number(a[key])) === (b[key] == null ? null : Number(b[key])));
}
