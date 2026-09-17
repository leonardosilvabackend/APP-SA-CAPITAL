import express from "express";
import type { Server } from "node:http";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
const state = vi.hoisted(() => ({ role: "admin" as string | null, query: vi.fn() }));
vi.mock("../auth/current-user", () => ({ getCurrentUser: async () => state.role ? { role: state.role } : null }));
vi.mock("../db/client", () => ({ getDatabase: () => ({ select: () => ({ from: () => ({ orderBy: state.query }) }) }) }));
import { stockRouter } from "./routes";
let server: Server, base: string;
beforeEach(async () => {
  state.role = "admin"; state.query.mockReset().mockResolvedValue(["SA", "Fraga & Bitello"].map((supplier, i) => ({ id: String(i), externalId: `original-${i}`, code: `10000${i}`, supplier, category: "Imóvel", administrator: "CNP", creditAmount: "100000.00", entryAmount: "20000.00", installmentCount: 100, installmentAmount: "1000.00", outstandingBalance: "80000.00", status: "available" })));
  const app = express(); app.use("/api/stock", stockRouter); server = await new Promise<Server>(resolve => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); }); base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/stock/export-sa`;
});
afterEach(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
it.each(["admin", "advisor"])("exports persisted SA and FB values with original and SA codes for %s", async role => {
  state.role = role; const response = await fetch(base); expect(response.status).toBe(200);
  const workbook = XLSX.read(Buffer.from(await response.arrayBuffer()), { type: "buffer" }); const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[workbook.SheetNames[0]]);
  expect(rows).toHaveLength(2); expect(rows[1]).toMatchObject({ "Cód.Cota original": "original-1", "Código SA": "100001", Fornecedor: "Fraga & Bitello", Crédito: 100000, Entrada: 20000 }); expect(state.query).toHaveBeenCalledOnce();
});
it.each([null, "user", "administrative"])("blocks stock download for %s", async role => { state.role = role; expect((await fetch(base)).status).toBe(role ? 403 : 401); expect(state.query).not.toHaveBeenCalled(); });
