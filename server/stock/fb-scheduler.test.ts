import { afterEach, expect, it, vi } from "vitest";
vi.mock("../config", () => ({ config: { appEnv: "test", fbSyncEnabled: true, fbSyncScheduleEnabled: true, fbSyncIntervalMinutes: 30 } }));
vi.mock("./fb-sync", () => ({ syncFbStock: vi.fn(), FbSyncError: class extends Error {} }));
vi.mock("./fb-monitor", async () => ({ trackedFbSync: (await import("./fb-sync")).syncFbStock }));
import { config } from "../config";
import { syncFbStock } from "./fb-sync";
import { fbSyncStatus, startFbScheduler, stopFbScheduler } from "./fb-scheduler";
afterEach(() => { stopFbScheduler(); vi.useRealTimers(); vi.clearAllMocks(); config.fbSyncEnabled = true; });
it("does not start when synchronization is disabled", () => {
  config.fbSyncEnabled = false;
  startFbScheduler();
  expect(syncFbStock).not.toHaveBeenCalled();
});
it("runs immediately, retries after 30 minutes and stops", async () => {
  vi.useFakeTimers();
  vi.mocked(syncFbStock).mockRejectedValueOnce(new Error("private connection details")).mockResolvedValue({ received: 2, created: 2, updated: 0, reserved: 0, reactivated: 0 });
  startFbScheduler();
  await vi.advanceTimersByTimeAsync(0);
  expect(fbSyncStatus().history[0].error).not.toContain("private");
  await vi.advanceTimersByTimeAsync(30 * 60_000 - 1);
  expect(syncFbStock).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(syncFbStock).toHaveBeenCalledTimes(2);
  expect(fbSyncStatus().history[0].result?.created).toBe(2);
  stopFbScheduler();
  await vi.advanceTimersByTimeAsync(30 * 60_000);
  expect(syncFbStock).toHaveBeenCalledTimes(2);
});
