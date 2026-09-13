import express from "express";
import type { Server } from "node:http";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DEFAULT_USER_PASSWORD } from "../../shared/contracts";
import { verifyPassword } from "../auth/password";
const state = vi.hoisted(() => ({ user: { id: "123e4567-e89b-42d3-a456-426614174001", role: "admin" }, changes: null as any, where: null as any, found: true, tokensRemoved: false, transactions: 0 }));
vi.mock("../auth/current-user", () => ({ getCurrentUser: async () => state.user }));
vi.mock("../db/client", () => {
  const db: any = {
    insert: () => ({ values: (value: any) => { state.changes = value; return { returning: async () => [{ ...value, id: "123e4567-e89b-42d3-a456-426614174000" }] }; } }),
    update: () => ({ set: (value: any) => { state.changes = value; return { where: (where: any) => { state.where = where; return { returning: async () => state.found ? [{ id: "123e4567-e89b-42d3-a456-426614174000" }] : [] }; } }; } }),
    delete: () => ({ where: async () => { state.tokensRemoved = true; } }),
    transaction: async (callback: any) => { state.transactions++; return callback(db); },
  };
  return { getDatabase: () => db };
});
import { usersRouter } from "./routes";
let server: Server, base: string;
beforeEach(async () => {
  state.user.role = "admin"; state.changes = null; state.where = null; state.found = true; state.tokensRemoved = false; state.transactions = 0;
  const app = express(); app.use(express.json()); app.use(usersRouter);
  server = await new Promise<Server>(resolve => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterEach(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
it("creates a user with the fixed password hashed even if a different password is submitted", async () => {
  const response = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Teste Usuário", email: "test@example.invalid", password: "attacker-chosen" }) });
  expect(response.status).toBe(201);
  expect(state.changes.passwordHash).not.toBe(DEFAULT_USER_PASSWORD);
  expect(await verifyPassword(DEFAULT_USER_PASSWORD, state.changes.passwordHash)).toBe(true);
  expect(await verifyPassword("attacker-chosen", state.changes.passwordHash)).toBe(false);
  expect(state.changes.mustChangePassword).toBe(true);
  expect((await response.json()).user).not.toHaveProperty("passwordHash");
});
it("resets with a hash, revokes sessions and removes old recovery tokens in one transaction", async () => {
  const response = await fetch(`${base}/123e4567-e89b-42d3-a456-426614174000/reset-password`, { method: "POST" });
  expect(response.status).toBe(200); expect(state.transactions).toBe(1); expect(state.tokensRemoved).toBe(true);
  expect(await verifyPassword(DEFAULT_USER_PASSWORD, state.changes.passwordHash)).toBe(true);
  expect(state.changes.mustChangePassword).toBe(true);
  expect(new PgDialect().sqlToQuery(state.changes.sessionVersion).sql).toContain('"users"."session_version" + 1');
});
it("limits advisor resets to managed users and returns 404 for unrelated targets", async () => {
  state.user.role = "advisor"; state.found = false;
  const response = await fetch(`${base}/123e4567-e89b-42d3-a456-426614174000/reset-password`, { method: "POST" });
  expect(response.status).toBe(404); expect(state.tokensRemoved).toBe(false);
  const query = new PgDialect().sqlToQuery(state.where);
  expect(query.sql).toContain('"users"."manager_id"'); expect(query.sql).toContain('"users"."role"');
  expect(query.params).toContain(state.user.id); expect(query.params).toContain("user");
});
it("blocks ordinary users from resetting passwords", async () => {
  state.user.role = "user";
  expect((await fetch(`${base}/123e4567-e89b-42d3-a456-426614174000/reset-password`, { method: "POST" })).status).toBe(403);
  expect(state.transactions).toBe(0);
});
