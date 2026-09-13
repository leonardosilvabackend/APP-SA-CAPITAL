import express from "express";
import type { Server } from "node:http";
import { getTableName } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ user: { id: "123e4567-e89b-42d3-a456-426614174001", role: "advisor" }, visible: true, status: "reserved", committed: false, condition: null as any, writes: 0 }));
vi.mock("../auth/current-user", () => ({ getCurrentUser: async () => state.user }));
vi.mock("../db/client", () => ({ getDatabase: () => database }));
import { quotesRouter } from "./routes";
const id = "123e4567-e89b-42d3-a456-426614174010", quotaId = "123e4567-e89b-42d3-a456-426614174011";
const database: any = {
  select: () => ({ from: (table: any) => {
    const name = getTableName(table);
    const rows = name === "saved_quotes" ? state.visible ? [{ id, selectedQuotas: [{ id: quotaId, code: "123456" }], expiresAt: new Date(Date.now() + 86400000) }] : [] : [{ id: quotaId, code: "123456", status: state.status, committed: state.committed }];
    const query: any = { where: (condition: any) => { if (name === "saved_quotes") state.condition = condition; return query; }, for: async () => rows, then: (resolve: any) => Promise.resolve(rows).then(resolve) };
    return query;
  } }),
  execute: async () => [],
  transaction: async (callback: any) => callback(database),
  update: () => { state.writes++; throw new Error("unexpected write"); },
};
let server: Server, base: string;
beforeEach(async () => {
  state.visible = true; state.status = "reserved"; state.committed = false; state.condition = null; state.writes = 0;
  const app = express(); app.use(express.json()); app.use(quotesRouter);
  server = await new Promise<Server>(resolve => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterEach(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
it.each(["reserved", "sold"])("blocks adding quotas with a %s quota and reports its code", async status => {
  state.status = status;
  const response = await fetch(`${base}/saved/${id}/selection`, { method: "POST" });
  expect(response.status).toBe(409); expect((await response.json()).error).toContain("Cota 123456 reservada");
});
it("blocks a quota still linked to a negotiation even if its stock status is inconsistent", async () => {
  state.status = "available"; state.committed = true;
  expect((await fetch(`${base}/saved/${id}/selection`, { method: "POST" })).status).toBe(409);
});
it("returns the selection only for available quotas", async () => {
  state.status = "available";
  const response = await fetch(`${base}/saved/${id}/selection`, { method: "POST" });
  expect(response.status).toBe(200); expect((await response.json()).quotaIds).toEqual([quotaId]);
});
it("blocks replacing the reserved selection with different available quota IDs", async () => {
  const response = await fetch(`${base}/saved/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quotaIds: ["123e4567-e89b-42d3-a456-426614174099"] }) });
  expect(response.status).toBe(409); expect(state.writes).toBe(0);
});
it("checks assessor ownership on direct selection requests", async () => {
  state.visible = false;
  expect((await fetch(`${base}/saved/${id}/selection`, { method: "POST" })).status).toBe(404);
  const query = new PgDialect().sqlToQuery(state.condition);
  expect(query.sql).toContain("managed.manager_id"); expect(query.params).toContain(state.user.id);
});
