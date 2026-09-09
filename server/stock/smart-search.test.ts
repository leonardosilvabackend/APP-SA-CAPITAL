import express from "express";
import type { Server } from "node:http";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { smartSearchInputSchema } from "../../shared/stock";

const state = vi.hoisted(() => ({ user: { role: "admin" } as { role: string } | null, where: null as unknown, query: vi.fn() }));
vi.mock("../auth/current-user", () => ({ getCurrentUser: async () => state.user }));
vi.mock("../db/client", () => ({ getDatabase: () => ({ select: () => ({ from: () => ({ where: (condition: unknown) => {
  state.where = condition;
  return state.query();
} }) }) }) }));
import { stockRouter } from "./routes";
let server: Server;
let url: string;
const input = { category: "Imóvel", administrator: "", targetCredit: 500000, priority: "entry" };
const item = { id: "one", code: "0001", category: "Imóvel", administrator: "Porto", installmentCount: 120, installmentAmount: "1000.00", outstandingBalance: "300000.00", creditAmount: "490000.00", entryAmount: "100000.00", supplier: "Privado" };
beforeEach(async () => {
  state.user = { role: "admin" }; state.where = null;
  state.query.mockReset().mockResolvedValue([item]);
  const app = express(); app.use(express.json()); app.use("/api/stock", stockRouter);
  server = await new Promise<Server>(resolve => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
  url = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/stock/smart-search`;
});
afterEach(async () => { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });
const request = (body: unknown = input) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const compile = (value: unknown) => new PgDialect().sqlToQuery(value as SQL);

it("loads positive-credit candidates up to the upper bound across all administrators", async () => {
  await request();
  const query = compile(state.where);
  expect(query.params).toEqual(["available", "Imóvel", 500000]);
  expect(query.sql).toContain('"credit_amount" > 0');
  expect(query.sql).toContain('"credit_amount" <= $3::numeric * 1.02');
  expect(query.sql).not.toContain('"administrator"');
});
it("adds the specific administrator filter", async () => {
  await request({ ...input, administrator: "Porto" });
  expect(compile(state.where).params).toContain("Porto");
  expect(compile(state.where).sql).toContain('"administrator" =');
});
it("returns no opportunity without falling back to out-of-range stock", async () => {
  state.query.mockResolvedValue([]);
  const response = await request();
  expect(await response.json()).toEqual({ items: [], summary: null, complete: true, priority: "entry" });
  expect(state.query).toHaveBeenCalledOnce();
});
it("requires a criterion, category and positive finite numeric credit", () => {
  for (const changes of [{ priority: undefined }, { priority: "" }, { category: " " }, { targetCredit: 0 }, { targetCredit: -1 }, { targetCredit: Infinity }, { targetCredit: "R$ 500.000,00" }]) {
    expect(smartSearchInputSchema.safeParse({ ...input, ...changes }).success).toBe(false);
  }
  expect(smartSearchInputSchema.safeParse({ ...input, targetCredit: 500000.01 }).success).toBe(true);
});
it("rejects invalid requests before querying stock", async () => {
  expect((await request({ ...input, priority: "" })).status).toBe(400);
  expect(state.query).not.toHaveBeenCalled();
});
it("preserves supplier visibility restrictions", async () => {
  state.user = { role: "user" };
  expect((await (await request()).json()).items[0].supplier).toBeNull();
  state.user = { role: "advisor" };
  expect((await (await request()).json()).items[0].supplier).toBe("Privado");
});
it("requires authentication", async () => {
  state.user = null;
  expect((await request()).status).toBe(401);
  expect(state.query).not.toHaveBeenCalled();
});
