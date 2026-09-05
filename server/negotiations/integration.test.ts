import "dotenv/config";
import { readFile, readdir } from "node:fs/promises";
import type { Server } from "node:http";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import express from "express";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "../db/schema";

// Opt-in: migrations run in a disposable schema with its own tables and sequence.
// Supabase Storage is mocked; no application records or files are changed.
const state = vi.hoisted(() => ({ db: null as any, user: null as any, uploadError: false, removed: [] as string[] }));
vi.mock("../db/client", () => ({ getDatabase: () => state.db }));
vi.mock("../auth/current-user", () => ({ getCurrentUser: async () => state.user }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ storage: { from: () => ({
  upload: async () => ({ error: state.uploadError ? { message: "upload failed" } : null }),
  remove: async (paths: string[]) => { state.removed.push(...paths); return { error: null }; },
  createSignedUrl: async () => ({ data: { signedUrl: "https://example.com/receipt" }, error: null }),
}) } }) }));
import { negotiationsRouter } from "./routes";
import { backfillNegotiations, reviewReservation } from "./service";
import { config } from "../config";

const suite = process.env.RUN_NEGOTIATION_DB_TESTS === "1" ? describe : describe.skip;
vi.setConfig({ testTimeout: 30000 });
suite("negotiations with PostgreSQL", () => {
  const schemaName = `test_negotiations_${crypto.randomUUID().replaceAll("-", "")}`;
  let client: ReturnType<typeof postgres>;
  let adminClient: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let server: Server;
  let base: string;
  let admin: typeof schema.users.$inferSelect;
  let owner: typeof schema.users.$inferSelect;
  let advisor: typeof schema.users.$inferSelect;
  let outsider: typeof schema.users.$inferSelect;
  let negotiationId: string;
  let reservationId: string;
  let quoteId: string;
  const request = async (path = "", method = "GET", body?: unknown) => {
    const response = await fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  };
  async function fixture(existingQuota?: typeof schema.quotas.$inferSelect) {
    const quota = existingQuota ?? (await db.insert(schema.quotas).values({ code: crypto.randomUUID(), category: "Imóvel", administrator: "Test administrator", creditAmount: "100000.00", entryAmount: "20000.00", installmentCount: 100, installmentAmount: "1000.00", outstandingBalance: "100000.00" }).returning())[0];
    const [quote] = await db.insert(schema.savedQuotes).values({ creatorId: owner.id, clientName: "Test customer", selectedQuotas: [quota], commissionRate: "2", expiresAt: new Date(Date.now() + 86400000) }).returning();
    const [reservation] = await db.insert(schema.reservationRequests).values({ quoteId: quote.id, requesterId: owner.id }).returning();
    return { quota, quote, reservation };
  }
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required for opt-in tests");
    adminClient = postgres(process.env.DATABASE_URL, { prepare: false, max: 1, onnotice: () => undefined });
    await adminClient.unsafe(`CREATE SCHEMA "${schemaName}"`);
    client = postgres(process.env.DATABASE_URL, { prepare: false, max: 4, connection: { search_path: `"${schemaName}",public` } });
    db = drizzle(client, { schema }); state.db = db;
    for (const file of (await readdir("drizzle")).filter(file => file.endsWith(".sql")).sort()) {
      const content = (await readFile(`drizzle/${file}`, "utf8")).replaceAll('"public".', `"${schemaName}".`).replace(/INSERT INTO storage\.buckets[\s\S]*?;/g, "");
      for (const statement of content.split("--> statement-breakpoint").filter(part => part.trim())) await client.unsafe(statement);
    }
    async function user(role: "admin" | "user" | "advisor", managerId?: string) {
      return (await db.insert(schema.users).values({ name: role, email: `${crypto.randomUUID()}@example.invalid`, passwordHash: "test-only", role, managerId }).returning())[0];
    }
    admin = await user("admin"); advisor = await user("advisor"); owner = await user("user", advisor.id); outsider = await user("user");
    state.user = admin;
    config.supabaseUrl ||= "https://example.supabase.co"; config.supabaseServiceRoleKey ||= "test-only";
    const app = express(); app.use("/api/negotiations", negotiationsRouter);
    app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(500).json({ error: error.message }));
    server = await new Promise<Server>(resolve => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/negotiations`;
  }, 120000);
  afterAll(async () => {
    if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
    if (client) await client.end();
    if (adminClient) {
      if (!/^test_negotiations_[0-9a-f]{32}$/.test(schemaName)) throw new Error("Invalid test schema");
      await adminClient.unsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await adminClient.end();
    }
  }, 30000);
  it("creates the first negotiation on approval and is idempotent", async () => {
    const data = await fixture(); reservationId = data.reservation.id; quoteId = data.quote.id;
    const result = await reviewReservation(reservationId, "approved", admin.id);
    negotiationId = result.negotiation!.id;
    expect(result.negotiation!.code).toBe("SA05092026");
    expect((await reviewReservation(reservationId, "approved", admin.id)).negotiation).toEqual(result.negotiation);
    expect((await db.select().from(schema.negotiations)).length).toBe(1);
    const detail = await request(`/${negotiationId}`);
    expect(detail.body.item).toMatchObject({ status: "awaiting_data", entryAmount: "22000.00", commissionAmount: "2000.00", remainingAmount: "22000.00" });
    expect((await db.select().from(schema.quotas).where(eq(schema.quotas.id, data.quota.id)))[0].status).toBe("reserved");
  });
  it("enforces user, advisor, administrative and download visibility", async () => {
    state.user = owner; expect((await request()).body.items).toHaveLength(1);
    expect((await request(`/${negotiationId}`, "PATCH", {})).status).toBe(403);
    state.user = advisor; expect((await request()).body.items).toHaveLength(1);
    state.user = { ...outsider, role: "advisor" }; expect((await request()).body.items).toHaveLength(0);
    state.user = outsider; expect((await request(`/${negotiationId}`)).status).toBe(404);
    expect((await request(`/${negotiationId}/payments/${crypto.randomUUID()}/receipts/${crypto.randomUUID()}`)).status).toBe(404);
    state.user = { ...admin, role: "administrative" }; expect((await request()).body.items).toHaveLength(1);
    state.user = null; expect((await request()).status).toBe(401);
    state.user = admin;
  });
  it("sums multiple signals and payments without duplicates and rejects stale edits", async () => {
    const payment = { id: crypto.randomUUID(), version: 0, kind: "signal", amount: "1000.10", paidAt: "2026-09-05T15:30:00-03:00" };
    expect((await request(`/${negotiationId}/payments`, "POST", payment)).status).toBe(201);
    expect((await request(`/${negotiationId}/payments`, "POST", payment)).status).toBe(201);
    expect((await request(`/${negotiationId}/payments`, "POST", { ...payment, amount: "900" })).status).toBe(409);
    expect((await request(`/${negotiationId}/payments`, "POST", { ...payment, id: crypto.randomUUID() })).status).toBe(409);
    const second = { ...payment, id: crypto.randomUUID(), version: 1, amount: "1999.90" };
    expect((await request(`/${negotiationId}/payments`, "POST", second)).status).toBe(201);
    const detail = (await request(`/${negotiationId}`)).body.item;
    expect(detail).toMatchObject({ paidAmount: "3000.00", signalAmount: "3000.00", remainingAmount: "19000.00" });
    expect(detail.payments).toHaveLength(2);
    expect((await request(`/${negotiationId}/payments/${payment.id}`, "PATCH", { ...payment, version: 2, amount: "500.10" })).status).toBe(200);
    expect((await request(`/${negotiationId}`)).body.item.remainingAmount).toBe("19500.00");
  });
  it("does not record a payment when receipt upload fails", async () => {
    state.uploadError = true;
    const result = await request(`/${negotiationId}/payments`, "POST", { id: crypto.randomUUID(), version: 3, kind: "payment", amount: "100", paidAt: new Date().toISOString(), receipt: { id: crypto.randomUUID(), name: "receipt.pdf", mimeType: "application/pdf", base64: Buffer.from("%PDF-1.4 test").toString("base64") } });
    state.uploadError = false;
    expect(result.status).toBe(502);
    expect((await request(`/${negotiationId}`)).body.item).toMatchObject({ version: 3, paidAmount: "2500.00" });
  });
  it("attaches receipts later and restricts their download", async () => {
    const detail = (await request(`/${negotiationId}`)).body.item;
    const paymentId = detail.payments[0].id;
    const receipt = { id: crypto.randomUUID(), name: "receipt.pdf", mimeType: "application/pdf", base64: Buffer.from("%PDF-1.4 test").toString("base64") };
    const path = `/${negotiationId}/payments/${paymentId}/receipts`;
    expect((await request(path, "POST", receipt)).status).toBe(201);
    expect((await request(path, "POST", receipt)).status).toBe(201);
    state.user = owner; expect((await request(`${path}/${receipt.id}`)).status).toBe(302);
    state.user = outsider; expect((await request(`${path}/${receipt.id}`)).status).toBe(404);
    state.user = admin;
  });
  it("prevents overpayment and finalizes after the entry is fully paid", async () => {
    let item = (await request(`/${negotiationId}`)).body.item;
    const payment = { id: crypto.randomUUID(), version: item.version, kind: "payment", amount: "19500.01", paidAt: new Date().toISOString() };
    expect((await request(`/${negotiationId}/payments`, "POST", payment)).status).toBe(400);
    const conditions = { version: item.version, status: "finalized", entryAmount: item.entryAmount, transferFee: item.transferFee, registrationFee: "50", commissionAmount: "1500" };
    expect((await request(`/${negotiationId}`, "PATCH", conditions)).status).toBe(400);
    expect((await request(`/${negotiationId}/payments`, "POST", { ...payment, amount: "19500.00" })).status).toBe(201);
    item = (await request(`/${negotiationId}`)).body.item;
    expect((await request(`/${negotiationId}`, "PATCH", { ...conditions, version: item.version })).status).toBe(200);
    expect((await request(`/${negotiationId}`)).body.item).toMatchObject({ status: "finalized", remainingAmount: "0.00", registrationFee: "50.00", commissionAmount: "1500.00" });
  });
  it("preserves the negotiation and receipts after deleting the original quote", async () => {
    await db.delete(schema.savedQuotes).where(eq(schema.savedQuotes.id, quoteId));
    expect((await request(`/${negotiationId}`)).body.item.payments).toHaveLength(3);
    expect((await db.select().from(schema.reservationRequests).where(eq(schema.reservationRequests.id, reservationId)))).toHaveLength(0);
  });
  it("allows only one competing reservation to claim a quota", async () => {
    const first = await fixture(); const second = await fixture(first.quota);
    const results = await Promise.allSettled([reviewReservation(first.reservation.id, "approved", admin.id), reviewReservation(second.reservation.id, "approved", admin.id)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
    expect(await db.select().from(schema.reservationRequests).where(and(eq(schema.reservationRequests.status, "approved"), eq(schema.reservationRequests.quoteId, first.quote.id)))).toHaveLength(results[0].status === "fulfilled" ? 1 : 0);
  });
  it("rolls back the reservation if negotiation creation fails", async () => {
    const data = await fixture();
    await db.update(schema.savedQuotes).set({ selectedQuotas: [{ ...data.quota, creditAmount: "99999999999999.00" }] }).where(eq(schema.savedQuotes.id, data.quote.id));
    await expect(reviewReservation(data.reservation.id, "approved", admin.id)).rejects.toThrow();
    expect((await db.select().from(schema.quotas).where(eq(schema.quotas.id, data.quota.id)))[0].status).toBe("available");
    expect((await db.select().from(schema.reservationRequests).where(eq(schema.reservationRequests.id, data.reservation.id)))[0].status).toBe("pending");
  });
  it("imports previously approved reservations without duplicating them", async () => {
    const data = await fixture();
    await db.update(schema.reservationRequests).set({ status: "approved", reviewedBy: admin.id, reviewedAt: new Date() }).where(eq(schema.reservationRequests.id, data.reservation.id));
    await backfillNegotiations();
    await backfillNegotiations();
    const rows = await db.select().from(schema.negotiations).where(eq(schema.negotiations.reservationId, data.reservation.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ ownerId: owner.id, status: "awaiting_data", entryAmount: "22000.00" });
  });
});
