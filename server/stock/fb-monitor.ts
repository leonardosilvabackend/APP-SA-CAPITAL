import { desc, eq } from "drizzle-orm";
import { config } from "../config";
import { getDatabase } from "../db/client";
import { stockSyncRuns } from "../db/schema";
import { FbSyncError, syncFbStock } from "./fb-sync";

export async function trackedFbSync(source: "manual" | "automatic") {
  if (!config.fbSyncEnabled) throw new FbSyncError("Sincronização FB desabilitada.", 403);
  const db = getDatabase()!;
  const [run] = await db.insert(stockSyncRuns).values({ source, status: "running" }).returning();
  try {
    const result = await syncFbStock();
    await db.update(stockSyncRuns).set({ status: "success", result, finishedAt: new Date() }).where(eq(stockSyncRuns.id, run.id));
    return result;
  } catch (error) {
    const message = error instanceof FbSyncError ? error.message : "Falha na atualização do estoque. Consulte o operador do sistema.";
    await db.update(stockSyncRuns).set({ status: "failed", error: message, finishedAt: new Date() }).where(eq(stockSyncRuns.id, run.id));
    throw error;
  }
}

export async function persistedFbStatus() {
  const db = getDatabase()!;
  const history = await db.select().from(stockSyncRuns).orderBy(desc(stockSyncRuns.startedAt)).limit(48);
  const [lastSuccess] = await db.select({ finishedAt: stockSyncRuns.finishedAt }).from(stockSyncRuns).where(eq(stockSyncRuns.status, "success")).orderBy(desc(stockSyncRuns.finishedAt)).limit(1);
  const stale = !lastSuccess?.finishedAt || Date.now() - lastSuccess.finishedAt.getTime() > config.fbSyncIntervalMinutes * 2 * 60_000;
  return { history, lastSuccessAt: lastSuccess?.finishedAt ?? null, stale,
    alert: stale ? "Estoque sem atualização confirmada no prazo esperado. Confira as condições antes de negociar." : null };
}
