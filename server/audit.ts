import type { StockTransaction } from "./stock/protection";
import { auditEvents } from "./db/schema";
export async function recordAudit(tx: StockTransaction, actorId: string | null, action: string, entityId: string, details: Record<string, unknown>) {
  await tx.insert(auditEvents).values({ actorId, action, entityId, details });
}
