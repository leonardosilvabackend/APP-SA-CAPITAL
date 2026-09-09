import express from "express";
import type { Server } from "node:http";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: null as null | { role: string },
  items: [] as { id: string }[],
  documents: [] as { storagePath: string }[],
  remove: vi.fn(),
  delete: vi.fn(),
}));
vi.mock("../auth/current-user", () => ({ getCurrentUser: async () => state.user }));
vi.mock("../config", () => ({ config: { supabaseUrl: "https://example.com", supabaseServiceRoleKey: "test", storageBucket: "private" } }));
vi.mock("../email", () => ({ sendStatusEmail: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ storage: { from: () => ({ remove: state.remove }) } }) }));
vi.mock("../db/client", () => ({ getDatabase: () => ({
  select: () => ({ from: () => ({ where: () => Object.assign(Promise.resolve(state.documents), { limit: async () => state.items }) }) }),
  delete: () => ({ where: state.delete }),
}) }));
import { preAnalysesRouter } from "./routes";

let server: Server;
let url: string;
beforeEach(async () => {
  state.user = { role: "admin" };
  state.items = [{ id: "analysis" }];
  state.documents = [{ storagePath: "analysis/document.pdf" }];
  state.remove.mockReset().mockResolvedValue({ error: null });
  state.delete.mockReset().mockResolvedValue(undefined);
  const app = express();
  app.use("/api/pre-analyses", preAnalysesRouter);
  server = await new Promise<Server>(resolve => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  url = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/pre-analyses/analysis`;
});
afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});
it.each(["admin", "administrative"])("allows %s to delete the analysis and its files", async role => {
  state.user = { role };
  expect((await fetch(url, { method: "DELETE" })).status).toBe(200);
  expect(state.remove).toHaveBeenCalledWith(["analysis/document.pdf"]);
  expect(state.delete).toHaveBeenCalledOnce();
});
it.each([null, "partner", "advisor"])("blocks deletion for %s", async role => {
  state.user = role ? { role } : null;
  expect((await fetch(url, { method: "DELETE" })).status).toBe(role ? 403 : 401);
  expect(state.remove).not.toHaveBeenCalled();
  expect(state.delete).not.toHaveBeenCalled();
});
it("preserves the record when file deletion fails", async () => {
  state.remove.mockResolvedValue({ error: { message: "Unavailable" } });
  expect((await fetch(url, { method: "DELETE" })).status).toBe(500);
  expect(state.delete).not.toHaveBeenCalled();
});
it("returns 404 for a missing analysis", async () => {
  state.items = [];
  expect((await fetch(url, { method: "DELETE" })).status).toBe(404);
  expect(state.remove).not.toHaveBeenCalled();
  expect(state.delete).not.toHaveBeenCalled();
});
it("deletes analyses without documents", async () => {
  state.documents = [];
  expect((await fetch(url, { method: "DELETE" })).status).toBe(200);
  expect(state.remove).not.toHaveBeenCalled();
  expect(state.delete).toHaveBeenCalledOnce();
});
