import { trackedFbSync } from "./fb-monitor";
import { config } from "../config";
import { FbSyncError, syncFbStock, type FbSyncResult } from "./fb-sync";

type Run = { startedAt: string; finishedAt: string; result?: FbSyncResult; error?: string };
const history: Run[] = [];
let running = false;
let nextRunAt: string | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let started = false;
export function fbSyncStatus() {
  return { environment: config.appEnv, enabled: config.fbSyncEnabled && config.fbSyncScheduleEnabled,
    intervalMinutes: config.fbSyncIntervalMinutes, running, nextRunAt, history };
}
export function startFbScheduler() {
  if (started || !fbSyncStatus().enabled) return;
  started = true;
  const run = async () => {
    running = true;
    nextRunAt = null;
    const entry: Run = { startedAt: new Date().toISOString(), finishedAt: "" };
    try { entry.result = await trackedFbSync("automatic"); }
    catch (error) { entry.error = error instanceof FbSyncError ? error.message : "Falha na atualização. Nova tentativa no próximo horário."; }
    finally {
      entry.finishedAt = new Date().toISOString();
      history.unshift(entry);
      history.splice(48);
      running = false;
      console.log("[FB TEST]", JSON.stringify(entry));
      if (started) {
        const delay = config.fbSyncIntervalMinutes * 60_000;
        nextRunAt = new Date(Date.now() + delay).toISOString();
        timer = setTimeout(() => void run(), delay);
        timer.unref();
      }
    }
  };
  void run();
}
export function stopFbScheduler() { started = false; clearTimeout(timer); nextRunAt = null; }
