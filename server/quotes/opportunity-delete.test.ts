import express from "express";
import type { Server } from "node:http";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: { id: "123e4567-e89b-42d3-a456-426614174001", role: "advisor" },
  found: true,
  condition: null as unknown,
  changes: null as unknown,
}));

vi.mock("../auth/current-user", () => ({ getCurrentUser: async () => state.user }));
vi.mock("../db/client", () => ({ getDatabase: () => database }));

import { quotesRouter } from "./routes";

const opportunityId = "123e4567-e89b-42d3-a456-426614174010";
const database: any = {
  update: () => ({
    set: (changes: unknown) => {
      state.changes = changes;
      return {
        where: (condition: unknown) => {
          state.condition = condition;
          return { returning: async () => state.found ? [{ id: opportunityId }] : [] };
        },
      };
    },
  }),
};

let server: Server;
let base: string;
beforeEach(async () => {
  state.user = { id: "123e4567-e89b-42d3-a456-426614174001", role: "advisor" };
  state.found = true; state.condition = null; state.changes = null;
  const app = express(); app.use(express.json()); app.use(quotesRouter);
  server = await new Promise<Server>(resolve => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterEach(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });

it("allows an advisor to deactivate an opportunity inside their ownership scope", async () => {
  const response = await fetch(`${base}/saved/${opportunityId}/opportunity`, { method: "DELETE" });
  expect(response.status).toBe(204);
  expect(state.changes).toEqual({ opportunityActive: false, opportunityReason: null });
  const query = new PgDialect().sqlToQuery(state.condition as any);
  expect(query.sql).toContain("managed.manager_id");
  expect(query.params).toContain(state.user.id);
});

it("does not reveal an opportunity outside the advisor scope", async () => {
  state.found = false;
  expect((await fetch(`${base}/saved/${opportunityId}/opportunity`, { method: "DELETE" })).status).toBe(404);
});

it("blocks profiles that cannot manage opportunities", async () => {
  state.user = { ...state.user, role: "user" };
  expect((await fetch(`${base}/saved/${opportunityId}/opportunity`, { method: "DELETE" })).status).toBe(403);
  expect(state.condition).toBeNull();
});
