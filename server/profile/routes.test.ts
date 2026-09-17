import express from "express";
import type { Server } from "node:http";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const state = vi.hoisted(() => ({ current: null as null | { id: string; managerId: string | null }, results: [] as any[][], queries: [] as unknown[], writes: vi.fn(), photoWrites: vi.fn(), photoReads: vi.fn() }));
vi.mock("../auth/current-user", () => ({ getCurrentUser: async () => state.current }));
vi.mock("../config", () => ({ config: { isProduction: false } }));
vi.mock("node:fs/promises", () => ({ mkdir: vi.fn(), writeFile: (...args: unknown[]) => state.photoWrites(...args), readFile: (...args: unknown[]) => state.photoReads(...args) }));
vi.mock("../db/client", () => ({ getDatabase: () => ({
  select: () => ({ from: () => ({ where: (query: unknown) => { state.queries.push(query); const limit = async () => state.results.shift() ?? []; return { limit, orderBy: () => ({ limit }) }; } }) }),
  update: () => ({ set: (data: unknown) => ({ where: async (query: unknown) => state.writes(data, query) }) }),
}) }));
import { profileRouter } from "./routes";
const self = "123e4567-e89b-42d3-a456-426614174000", assigned = "123e4567-e89b-42d3-a456-426614174001", other = "123e4567-e89b-42d3-a456-426614174002";
let server: Server, base: string;
beforeEach(async () => {
  state.current = { id: self, managerId: assigned }; state.results = []; state.queries = []; state.writes.mockReset(); state.photoWrites.mockReset(); state.photoReads.mockReset().mockResolvedValue(Buffer.from([255, 216, 255, 0]));
  const app = express(); app.use("/api/profile", profileRouter); app.use((error: { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => { res.status(error.status ?? 500).json({ error: "Invalid file" }); });
  server = await new Promise<Server>(resolve => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); }); base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/profile`;
});
afterEach(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
it("returns only the assigned active advisor contact", async () => {
  state.results = [[{ id: assigned, name: "Assessor", phone: "123" }]];
  const result = await (await fetch(base + "/advisor")).json();
  expect(result.advisor).toEqual({ id: assigned, name: "Assessor", phone: "123", photoUrl: `/api/profile/photo/${assigned}`, fallback: false });
  expect(new PgDialect().sqlToQuery(state.queries[0] as SQL).params).toEqual([assigned, "advisor", "active"]);
});
it("falls back to Leonardo without writing managerId or modifying permissions", async () => {
  state.results = [[], [{ id: other, name: "Leonardo Administrador", phone: "456" }]];
  const result = await (await fetch(base + "/advisor")).json(); expect(result.advisor.fallback).toBe(true); expect(result.advisor.id).toBe(other);
  expect(new PgDialect().sqlToQuery(state.queries[1] as SQL).params).toEqual(["admin", "active", "Leonardo%"]); expect(state.writes).not.toHaveBeenCalled();
});
it("blocks anonymous profile access, uploads and downloads before storage", async () => {
  state.current = null;
  for (const [path, method] of [["/advisor", "GET"], ["/photo", "POST"], ["/photo/" + self, "GET"], ["", "PATCH"]]) expect((await fetch(base + path, { method })).status).toBe(401);
  expect(state.photoWrites).not.toHaveBeenCalled(); expect(state.photoReads).not.toHaveBeenCalled();
});
it("blocks another user's photo while allowing the assigned advisor", async () => {
  state.results = [[{ id: assigned, name: "Assessor", phone: null }]];
  expect((await fetch(base + "/photo/" + other)).status).toBe(403); expect(state.photoReads).not.toHaveBeenCalled();
  state.results = [[{ id: assigned, name: "Assessor", phone: null }]];
  expect((await fetch(base + "/photo/" + assigned)).status).toBe(200);
});
it("validates the content of the photo and always writes the authenticated user's path", async () => {
  const upload = (bytes: number[]) => fetch(base + "/photo", { method: "POST", headers: { "Content-Type": "image/png" }, body: new Uint8Array(bytes) });
  expect((await upload([1, 2, 3])).status).toBe(400); expect(state.photoWrites).not.toHaveBeenCalled();
  expect((await upload([137, 80, 78, 71, 13, 10, 26, 10])).status).toBe(200);
  expect(state.photoWrites.mock.calls[0][0]).toMatch(new RegExp(self + "$"));
});
it("allows only a self phone update, rejecting role and manager changes", async () => {
  const update = (body: unknown) => fetch(base, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  expect((await update({ phone: "123", role: "admin" })).status).toBe(400); expect(state.writes).not.toHaveBeenCalled();
  expect((await update({ phone: "123" })).status).toBe(200);
  expect(new PgDialect().sqlToQuery(state.writes.mock.calls[0][1] as SQL).params).toEqual([self]);
});
