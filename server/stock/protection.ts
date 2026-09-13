import { sql } from "drizzle-orm";
import { negotiations, quotas } from "../db/schema";
import type { getDatabase } from "../db/client";

type Database = NonNullable<ReturnType<typeof getDatabase>>;
export type StockTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

// Serialize stock lifecycle operations before taking quote/negotiation row locks.
export async function lockStock(tx: StockTransaction, shared = false) {
  await tx.execute(shared ? sql`select pg_advisory_xact_lock_shared(7365, 4)` : sql`select pg_advisory_xact_lock(7365, 4)`);
  if (shared) return;
  await tx.execute(sql`lock table ${quotas} in share row exclusive mode`);
}
export function committedQuota(exceptId?: string) {
  return sql`exists (select 1 from ${negotiations} as committed
    cross join lateral jsonb_array_elements(committed.selected_quotas) as selected(value)
    where committed.status <> 'cancelled'
    and (${exceptId ?? null}::uuid is null or committed.id <> ${exceptId ?? null}::uuid)
    and (selected.value->>'id' = ${quotas.id}::text or selected.value->>'code' = ${quotas.code}))`;
}
