import express from "express";
import type { Server } from "node:http";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ user: null as null | { role: string }, preview: vi.fn(), sync: vi.fn() }));
vi.mock("../auth/current-user", () => ({ getCurrentUser: async () => state.user }));
vi.mock("./fb-sync", async importOriginal => ({ ...await importOriginal<typeof import("./fb-sync")>(), previewFbStockSync: state.preview, syncFbStock: state.sync }));
vi.mock("./fb-monitor", () => ({ trackedFbSync: state.sync, persistedFbStatus: async () => ({ history: [], stale: true }) }));
import { stockRouter } from "./routes";
import { FbSyncError } from "./fb-sync";
let server: Server;
let base: string;
beforeEach(async () => {
  state.user = { role: "admin" };
  state.preview.mockReset().mockResolvedValue({ received: 1, wouldCreate: 1, wouldUpdate: 0, wouldReserve: 0, wouldReactivate: 0, canSync: true });
  state.sync.mockReset();
  const app = express(); app.use("/api/stock", stockRouter);
  server = await new Promise<Server>(resolve => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/stock`;
});
afterEach(async () => { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });
it.each(["admin", "administrative"])("allows preview for %s without calling sync", async role => {
  state.user = { role };
  const response = await fetch(`${base}/sync-fb/preview`, { method: "POST" });
  expect(response.status).toBe(200); expect((await response.json()).wouldCreate).toBe(1);
  expect(state.preview).toHaveBeenCalledOnce(); expect(state.sync).not.toHaveBeenCalled();
});
it.each([null, "advisor", "user"])("rejects preview for %s", async role => {
  state.user = role ? { role } : null;
  expect((await fetch(`${base}/sync-fb/preview`, { method: "POST" })).status).toBe(role ? 403 : 401);
  expect(state.preview).not.toHaveBeenCalled(); expect(state.sync).not.toHaveBeenCalled();
});
it("returns a useful error for invalid upstream data", async () => {
  state.preview.mockRejectedValue(new FbSyncError("Resposta inválida da API FB"));
  const response = await fetch(`${base}/sync-fb/preview`, { method: "POST" });
  expect(response.status).toBe(502); expect((await response.json()).error).toContain("API FB");
});
it("uses the central sync function and surfaces a concurrency conflict", async () => {
  state.sync.mockRejectedValue(new FbSyncError("Já está em andamento", 409));
  expect((await fetch(`${base}/sync-fb`, { method: "POST" })).status).toBe(409);
  expect(state.sync).toHaveBeenCalledOnce(); expect(state.preview).not.toHaveBeenCalled();
});
