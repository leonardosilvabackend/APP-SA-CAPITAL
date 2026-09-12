import { createClient } from "@supabase/supabase-js";
import { asc, eq, sql } from "drizzle-orm";
import { config } from "../config";
import { getDatabase } from "../db/client";
import { storageCleanup } from "../db/schema";
import type { StockTransaction } from "../stock/protection";

export async function queueStorageCleanup(paths: string[], tx: StockTransaction | NonNullable<ReturnType<typeof getDatabase>> = getDatabase()!) {
  if (paths.length) await tx.insert(storageCleanup).values([...new Set(paths)].map(path => ({ path }))).onConflictDoNothing();
}
export async function processStorageCleanup() {
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) return;
  const db = getDatabase()!;
  const storage = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, { auth: { persistSession: false } }).storage.from(config.storageBucket);
  const pending = await db.select().from(storageCleanup).orderBy(asc(storageCleanup.createdAt)).limit(100);
  for (const item of pending) {
    try {
      const result = await storage.remove([item.path]);
      if (result.error) throw new Error("Storage removal failed");
      await db.delete(storageCleanup).where(eq(storageCleanup.id, item.id));
    } catch {
      await db.update(storageCleanup).set({ attempts: sql`${storageCleanup.attempts} + 1` }).where(eq(storageCleanup.id, item.id));
      console.error("[Storage] Remocao pendente; nova tentativa programada", item.id);
    }
  }
}
