import express from "express";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { administratorInputSchema } from "../../shared/administrators";

const state = vi.hoisted(() => ({ user: null as null | { role: string }, rows: [] as any[], insert: vi.fn() }));
vi.mock("../auth/current-user", () => ({ getCurrentUser: async () => state.user }));
vi.mock("../db/client", () => ({ getDatabase: () => ({
  select: () => ({ from: () => ({ orderBy: async () => state.rows }) }),
  insert: () => ({ values: (data: any) => ({ returning: async () => { state.insert(data); state.rows.push(data); return [data]; } }) }),
}) }));
import { administratorsRouter } from "./routes";
let server: Server;
let base: string;
beforeEach(async () => {
  state.user = { role: "admin" }; state.rows = []; state.insert.mockClear();
  const app = express(); app.use("/api/administrators", administratorsRouter);
  server = await new Promise<Server>(resolve => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
  const address = server.address() as { port: number };
  base = `http://127.0.0.1:${address.port}/api/administrators`;
});
afterEach(async () => { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });
const valid = { name: "  Porto Seguro  ", characteristics: "Consorcios", website: "https://example.com", documents: [] };
const create = (body: unknown) => fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
describe("administrators API", () => {
  it("saves through the database and returns it on subsequent reads", async () => {
    const response = await create(valid);
    expect(response.status).toBe(201);
    const { item } = await response.json();
    expect(item.name).toBe("Porto Seguro"); expect(state.insert).toHaveBeenCalledOnce();
    for (let i = 0; i < 2; i++) expect((await (await fetch(base)).json()).items).toEqual([item]);
  });
  it("requires login for listing", async () => {
    state.user = null; expect((await fetch(base)).status).toBe(401);
  });
  it("allows partners to read but prevents creation", async () => {
    state.user = { role: "partner" };
    expect((await fetch(base)).status).toBe(200);
    expect((await create(valid)).status).toBe(403); expect(state.insert).not.toHaveBeenCalled();
  });
  it("rejects unsafe links and blank names before writing", async () => {
    for (const body of [{ ...valid, website: "javascript:alert(1)" }, { ...valid, name: "   " }]) expect((await create(body)).status).toBe(400);
    expect(state.insert).not.toHaveBeenCalled();
  });
  it("rejects invalid attachment types, encoding and combined size", () => {
    const file = { name: "file.pdf", mimeType: "application/pdf", base64: "YQ==" };
    expect(administratorInputSchema.safeParse({ ...valid, documents: [file] }).success).toBe(true);
    for (const documents of [[{ ...file, mimeType: "text/html" }], [{ ...file, base64: "not base64" }], Array.from({ length: 11 }, () => file), [{ ...file, base64: "AAAA".repeat(2 * 1024 * 1024) }, { ...file, base64: "AAAA".repeat(2 * 1024 * 1024) }]]) {
      expect(administratorInputSchema.safeParse({ ...valid, documents }).success).toBe(false);
    }
  });
});
