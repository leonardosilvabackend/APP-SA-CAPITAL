import express from "express";
import type { Server } from "node:http";
import { getTableName } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ user: null as any, rows: [] as any[], deleted: [] as string[], hashes: vi.fn(async () => "hashed-password") }));
vi.mock("./current-user", () => ({ getCurrentUser: async () => state.user }));
vi.mock("./password", () => ({ hashPassword: state.hashes, verifyPassword: async () => true }));
vi.mock("./session", () => ({ createSessionToken: async () => "new-session", setSessionCookie: () => undefined, clearSessionCookie: () => undefined }));
vi.mock("../email", () => ({ sendPasswordResetEmail: vi.fn() }));
vi.mock("../db/client", () => ({ getDatabase: () => db }));
const db: any = {
  transaction: async (callback: any) => callback(db),
  select: () => ({ from: () => ({ where: () => ({ limit: async () => state.rows, for: async () => state.rows }) }) }),
  insert: () => ({ values: () => ({ onConflictDoUpdate: () => ({ returning: async () => [{ attempts: 1 }] }) }) }),
  update: () => ({ set: () => ({ where: () => Object.assign(Promise.resolve(), { returning: async () => [{ ...state.user, mustChangePassword: false, sessionVersion: 2 }] }) }) }),
  delete: (table: any) => ({ where: async () => { state.deleted.push(getTableName(table)); } }),
};
import { authRouter } from "./routes";
let server: Server, base: string;
beforeEach(async () => {
  state.user = null; state.rows = []; state.deleted = []; state.hashes.mockClear();
  const app = express(); app.use(express.json()); app.use(authRouter);
  server = await new Promise<Server>(resolve => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterEach(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
const post = (path: string, body: unknown) => fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
it("never exposes public administrator provisioning", async () => {
  expect((await post("/setup-admin", { name: "Intruder", email: "x@example.test", password: "password123" })).status).toBe(403);
  expect(await (await fetch(base + "/setup-status")).json()).toEqual({ needsSetup: false });
  expect(state.hashes).not.toHaveBeenCalled();
});
it("rejects an invalid recovery token before computing a password hash", async () => {
  expect((await post("/reset-password", { token: "x".repeat(43), password: "password123" })).status).toBe(400);
  expect(state.hashes).not.toHaveBeenCalled();
});
it("invalidates pending recovery tokens on authenticated password change", async () => {
  state.user = { id: "123e4567-e89b-42d3-a456-426614174000", sessionVersion: 1, status: "active", role: "user", name: "Test", email: "user@example.test", passwordHash: "old" };
  state.rows = [state.user];
  expect((await post("/change-password", { currentPassword: "old-password", newPassword: "new-password" })).status).toBe(200);
  expect(state.deleted).toContain("password_reset_tokens");
});
