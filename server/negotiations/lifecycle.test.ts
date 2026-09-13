import express from "express";
import type { Server } from "node:http";
import { PgDialect } from "drizzle-orm/pg-core";
import { getTableName } from "drizzle-orm";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ user: { id: "123e4567-e89b-42d3-a456-426614174001", role: "admin" }, item: null as any, visible: true, writes: [] as any[], conditions: [] as any[], failDelete: false }));
vi.mock("../auth/current-user", () => ({ getCurrentUser: async () => state.user }));
vi.mock("../db/client", () => ({ getDatabase: () => database }));
import { negotiationsRouter } from "./routes";
const database: any = { transaction: async (callback: any) => {
  const pending: any[] = [];
  const tx = {
    execute: async () => [],
    select: () => ({ from: (table: any) => {
      const rows = getTableName(table) === "negotiations" && state.visible ? [{ item: state.item, ownerName: "Test" }] : [];
      const query: any = { innerJoin: () => query, where: (condition: any) => { state.conditions.push(condition); return query; }, for: async () => rows, then: (resolve: any) => Promise.resolve(rows).then(resolve) };
      return query;
    } }),
    insert: (table: any) => ({ values: (values: any) => ({ onConflictDoNothing: async () => { pending.push({ table: getTableName(table), type: "insert", values }); } }) }),
    update: (table: any) => ({ set: (values: any) => ({ where: async (condition: any) => { pending.push({ table: getTableName(table), type: "update", values, condition }); } }) }),
    delete: (table: any) => ({ where: async () => { if (state.failDelete) throw new Error("simulated deletion failure"); pending.push({ table: getTableName(table), type: "delete" }); } }),
  };
  const result = await callback(tx); state.writes.push(...pending); return result;
} };
let server: Server, base: string;
beforeEach(async () => {
  state.user.role = "admin"; state.visible = true; state.writes = []; state.conditions = []; state.failDelete = false;
  state.item = { id: "123e4567-e89b-42d3-a456-426614174010", version: 2, status: "awaiting_data", reservationId: "123e4567-e89b-42d3-a456-426614174011", selectedQuotas: [{ id: "123e4567-e89b-42d3-a456-426614174012", code: "123456", createdAt: "2026-01-01T00:00:00Z", administrator: "Test", category: "Imovel", creditAmount: "100000", entryAmount: "20000", installmentAmount: "1000", installmentCount: 100, outstandingBalance: "100000" }] };
  const app = express(); app.use(negotiationsRouter); app.use((_error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(500).json({ error: "failure" }));
  server = await new Promise<Server>(resolve => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/${state.item.id}`;
});
afterEach(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
const request = (action = "cancel", version = 2) => fetch(base + (action === "cancel" ? "/cancel" : ""), { method: action === "cancel" ? "POST" : "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version }) });
it("cancels while keeping history and releasing the quotas atomically", async () => {
  expect((await request()).status).toBe(200);
  expect(state.writes).toContainEqual(expect.objectContaining({ table: "negotiations", type: "update", values: expect.objectContaining({ status: "cancelled", version: 3 }) }));
  expect(state.writes).toContainEqual(expect.objectContaining({ table: "quotas", type: "update", values: expect.objectContaining({ status: "available" }) }));
  expect(state.writes.some(write => write.type === "delete")).toBe(false);
  expect(state.writes.find(write => write.table === "quotas" && write.type === "insert").values).not.toHaveProperty("createdAt");
  const release = state.writes.find(write => write.table === "quotas" && write.type === "update");
  const sql = new PgDialect().sqlToQuery(release.condition);
  expect(sql.sql).toContain("committed.id <>"); expect(sql.params).toContain(state.item.id);
});
it.each(["cancelled", "finalized"])("rejects cancellation of %s negotiations", async status => {
  state.item.status = status; expect((await request()).status).toBe(409); expect(state.writes).toHaveLength(0);
});
it("rejects stale versions without touching stock", async () => { expect((await request("cancel", 1)).status).toBe(409); expect(state.writes).toHaveLength(0); });
it("deletes the negotiation and marks its source to prevent recreation by backfill", async () => {
  expect((await request("delete")).status).toBe(200);
  expect(state.writes).toContainEqual({ table: "negotiations", type: "delete" });
  expect(state.writes).toContainEqual(expect.objectContaining({ table: "reservation_requests", values: expect.objectContaining({ status: "cancelled" }) }));
});
it("does not release stock again when deleting an already cancelled history", async () => {
  state.item.status = "cancelled";
  expect((await request("delete")).status).toBe(200);
  expect(state.writes).toEqual([{ table: "negotiations", type: "delete" }]);
});
it("rolls back stock release if permanent deletion fails", async () => { state.failDelete = true; expect((await request("delete")).status).toBe(500); expect(state.writes).toHaveLength(0); });
it.each(["cancel", "delete"])("denies advisor %s access to an unrelated ID", async action => {
  state.user.role = "advisor"; state.visible = false;
  expect((await request(action)).status).toBe(action === "delete" ? 403 : 404); expect(state.writes).toHaveLength(0);
  if (action === "delete") return;
  const scope = new PgDialect().sqlToQuery(state.conditions[0]);
  expect(scope.params).toContain(state.user.id); expect(scope.sql).toContain("managed.manager_id");
});
it("denies ordinary users lifecycle mutations", async () => { state.user.role = "user"; expect((await request()).status).toBe(403); expect(state.writes).toHaveLength(0); });
