import express from "express";
import type { Server } from "node:http";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  current: null as null | { id: string; role: string },
  rows: [] as any[],
  changes: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("../auth/current-user", () => ({ getCurrentUser: async () => state.current }));
vi.mock("../db/client", () => ({ getDatabase: () => ({
  select: () => ({ from: () => ({ where: () => ({ limit: async () => state.rows }) }) }),
  update: () => ({ set: (changes: unknown) => { state.changes(changes); return { where: () => ({ returning: async () => state.rows }) }; } }),
  delete: () => ({ where: () => ({ returning: state.remove }) }),
}) }));
import { usersRouter } from "./routes";
const id = "123e4567-e89b-42d3-a456-426614174000";
const adminId = "123e4567-e89b-42d3-a456-426614174001";
let server: Server;
let base: string;
beforeEach(async () => {
  state.current = { id: adminId, role: "admin" };
  state.rows = [{ id, name: "Cliente", role: "user", managerId: null, passwordHash: "private", sessionVersion: 0 }];
  state.changes.mockReset();
  state.remove.mockReset().mockResolvedValue([{ id }]);
  const app = express(); app.use(express.json()); app.use("/api/users", usersRouter);
  server = await new Promise<Server>(resolve => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/users`;
});
afterEach(async () => { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });
const patch = (body: unknown, target = id) => fetch(`${base}/${target}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
it("edits contact details without exposing credentials", async () => {
  const response = await patch({ name: "Novo nome", email: "NOVO@example.com", phone: "123" });
  expect(response.status).toBe(200);
  expect(state.changes).toHaveBeenCalledWith(expect.objectContaining({ name: "Novo nome", email: "novo@example.com", phone: "123" }));
  const { user } = await response.json();
  expect(user).not.toHaveProperty("passwordHash"); expect(user).not.toHaveProperty("sessionVersion");
});
it.each([null, "advisor", "administrative", "user"])("blocks unauthorized changes for %s", async role => {
  state.current = role ? { id: adminId, role } : null;
  expect((await patch({ name: "Novo nome" })).status).toBe(role ? 403 : 401);
  expect((await fetch(`${base}/${id}`, { method: "DELETE" })).status).toBe(role ? 403 : 401);
  expect(state.changes).not.toHaveBeenCalled(); expect(state.remove).not.toHaveBeenCalled();
});
it("prevents self deletion and removal of own admin access", async () => {
  expect((await fetch(`${base}/${adminId}`, { method: "DELETE" })).status).toBe(400);
  expect((await patch({ role: "user" }, adminId)).status).toBe(400);
  expect((await patch({ status: "inactive" }, adminId)).status).toBe(400);
  expect(state.remove).not.toHaveBeenCalled(); expect(state.changes).not.toHaveBeenCalled();
});
it("deletes an unlinked user", async () => {
  expect((await fetch(`${base}/${id}`, { method: "DELETE" })).status).toBe(200);
  expect(state.remove).toHaveBeenCalledOnce();
});
it("explains when linked history prevents deletion", async () => {
  state.remove.mockRejectedValue({ cause: { code: "23503" } });
  const response = await fetch(`${base}/${id}`, { method: "DELETE" });
  expect(response.status).toBe(409);
  expect((await response.json()).error).toContain("Desative");
});
it("rejects invalid email and unknown users", async () => {
  expect((await patch({ email: "invalid" })).status).toBe(400);
  state.rows = [];
  expect((await patch({ name: "Novo nome" })).status).toBe(404);
  state.remove.mockResolvedValue([]);
  expect((await fetch(`${base}/${id}`, { method: "DELETE" })).status).toBe(404);
});
