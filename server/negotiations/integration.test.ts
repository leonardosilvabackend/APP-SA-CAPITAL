import { assertDatabaseSafety, validateEnvironment } from "../environment";
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
import { stockRouter } from "../stock/routes";
import { quotesRouter } from "../quotes/routes";
import { usersRouter } from "../users/routes";
import { preAnalysesRouter } from "../pre-analyses/routes";
import { backfillNegotiations, reviewReservation } from "./service";
import { config } from "../config";
import { consumePersistentLimit } from "../auth/rate-limit";
import { queueStatusEmail, processEmailJobs } from "../email-queue";
import { sendStatusEmail } from "../email";
import { persistedFbStatus } from "../stock/fb-monitor";
import { notificationsRouter } from "../notifications/routes";
vi.mock("../email", () => ({ sendStatusEmail: vi.fn() }));

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
    assertDatabaseSafety();
    const testUrl = process.env.SA_MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL!;
    validateEnvironment({ ...process.env, DATABASE_URL: testUrl }, true);
    adminClient = postgres(testUrl, { prepare: false, max: 1, onnotice: () => undefined });
    await adminClient.unsafe(`CREATE SCHEMA "${schemaName}"`);
    client = postgres(testUrl, { prepare: false, max: 4, connection: { search_path: `"${schemaName}",public` } });
    db = drizzle(client, { schema }); state.db = db;
    for (const file of (await readdir("drizzle")).filter(file => file.endsWith(".sql")).sort()) {
      const content = (await readFile(`drizzle/${file}`, "utf8")).replaceAll('"public".', `"${schemaName}".`).replace(/INSERT INTO storage\.buckets[\s\S]*?;/g, "");
      await client.begin(async tx => { for (const statement of content.split("--> statement-breakpoint").filter(part => part.trim())) await tx.unsafe(statement); });
    }
    async function user(role: "admin" | "user" | "advisor", managerId?: string) {
      return (await db.insert(schema.users).values({ name: role, email: `${crypto.randomUUID()}@example.invalid`, passwordHash: "test-only", role, managerId }).returning())[0];
    }
    admin = await user("admin"); advisor = await user("advisor"); owner = await user("user", advisor.id); outsider = await user("user");
    state.user = admin;
    config.supabaseUrl ||= "https://example.supabase.co"; config.supabaseServiceRoleKey ||= "test-only";
    const app = express(); app.use("/api/negotiations", negotiationsRouter);
    app.use(express.json()); app.use("/api/stock", stockRouter); app.use("/api/quotes", quotesRouter); app.use("/api/users", usersRouter); app.use("/api/pre-analyses", preAnalysesRouter); app.use("/api/notifications", notificationsRouter);
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
  async function apiRequest(path: string, method = "GET", body?: unknown) {
    const response = await fetch(base.replace("/api/negotiations", path), { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  }
  it("preserves reserved identity and values on replacement, then releases on cancellation", async () => {
    state.user = admin;
    const data = await fixture();
    const approved = await reviewReservation(data.reservation.id, "approved", admin.id);
    const imported = await apiRequest("/api/stock/import/commit", "POST", { mode: "replace", rows: [{ ...data.quota, creditAmount: "99999", status: "available" }] });
    expect(imported.status).toBe(200);
    const stock = await db.select().from(schema.quotas).where(eq(schema.quotas.code, data.quota.code));
    expect(stock).toHaveLength(1); expect(stock[0]).toMatchObject({ id: data.quota.id, status: "reserved", creditAmount: data.quota.creditAmount });
    expect((await apiRequest(`/api/quotes/saved/${data.quote.id}`)).body.item.warnings).toEqual([`Cota ${data.quota.code} reservada`]);
    expect((await apiRequest(`/api/quotes/saved/${data.quote.id}/selection`, "POST")).status).toBe(409);
    expect((await apiRequest(`/api/quotes/saved/${data.quote.id}`, "PATCH", { quotaIds: [data.quota.id] })).status).toBe(409);
    expect((await request(`/${approved.negotiation!.id}/cancel`, "POST", { version: 0 })).status).toBe(200);
    expect((await db.select().from(schema.quotas).where(eq(schema.quotas.id, data.quota.id)))[0].status).toBe("available");
    expect((await request(`/${approved.negotiation!.id}`)).body.item.status).toBe("cancelled");
    expect((await request(`/${approved.negotiation!.id}/cancel`, "POST", { version: 1 })).status).toBe(409);
  });
  it("preserves reserved quotas absent from the new sheet and repairs active links", async () => {
    state.user = admin;
    const data = await fixture(); await reviewReservation(data.reservation.id, "approved", admin.id);
    await db.update(schema.quotas).set({ status: "available" }).where(eq(schema.quotas.id, data.quota.id));
    const manual = await fixture(); await db.update(schema.quotas).set({ status: "reserved" }).where(eq(schema.quotas.id, manual.quota.id));
    const response = await apiRequest("/api/stock/import/commit", "POST", { mode: "replace", rows: [{ ...data.quota, code: crypto.randomUUID(), status: "available" }] });
    expect(response.status).toBe(200);
    for (const id of [data.quota.id, manual.quota.id]) expect((await db.select().from(schema.quotas).where(eq(schema.quotas.id, id)))[0].status).toBe("reserved");
  });
  it("rolls back replacement when the new stock cannot be inserted", async () => {
    const data = await fixture(); state.user = admin;
    const result = await apiRequest("/api/stock/import/commit", "POST", { mode: "replace", rows: [{ ...data.quota, code: crypto.randomUUID(), creditAmount: "999999999999999" }] });
    expect(result.status).toBe(500);
    expect((await db.select().from(schema.quotas).where(eq(schema.quotas.id, data.quota.id)))[0].status).toBe("available");
  });
  it("permanently deletes payments and receipts, releases stock and does not resurrect history", async () => {
    state.user = admin; const data = await fixture();
    const result = await reviewReservation(data.reservation.id, "approved", admin.id);
    const id = result.negotiation!.id, paymentId = crypto.randomUUID();
    await db.insert(schema.negotiationPayments).values({ id: paymentId, negotiationId: id, kind: "signal", amount: "100", paidAt: new Date(), recordedBy: admin.id, updatedBy: admin.id });
    await db.insert(schema.negotiationReceipts).values({ id: crypto.randomUUID(), paymentId, fileName: "test.pdf", mimeType: "application/pdf", storagePath: "test/receipt", uploadedBy: admin.id });
    expect((await request(`/${id}`, "DELETE", { version: 0 })).status).toBe(200);
    expect((await request(`/${id}`)).status).toBe(404);
    expect(await db.select().from(schema.negotiationPayments).where(eq(schema.negotiationPayments.negotiationId, id))).toHaveLength(0);
    expect(await db.select().from(schema.negotiationReceipts).where(eq(schema.negotiationReceipts.paymentId, paymentId))).toHaveLength(0);
    expect((await db.select().from(schema.quotas).where(eq(schema.quotas.id, data.quota.id)))[0].status).toBe("available");
    await backfillNegotiations(); expect((await request(`/${id}`)).status).toBe(404);
  });
  it("deleting cancelled history cannot release the same quota from a newer negotiation", async () => {
    state.user = admin; const data = await fixture();
    const first = await reviewReservation(data.reservation.id, "approved", admin.id);
    expect((await request(`/${first.negotiation!.id}/cancel`, "POST", { version: 0 })).status).toBe(200);
    const second = await fixture(data.quota); await reviewReservation(second.reservation.id, "approved", admin.id);
    expect((await request(`/${first.negotiation!.id}`, "DELETE", { version: 1 })).status).toBe(200);
    expect((await db.select().from(schema.quotas).where(eq(schema.quotas.id, data.quota.id)))[0].status).toBe("reserved");
  });
  it("protects assessor lists and direct IDs in quotes, users and pre-analyses", async () => {
    const data = await fixture();
    const [analysis] = await db.insert(schema.preAnalyses).values({ partnerId: owner.id, customerType: "PF", customerName: "Private customer", document: "12345678901" }).returning();
    state.user = advisor;
    expect((await apiRequest(`/api/quotes/saved/${data.quote.id}`, "PATCH", { clientName: "Managed customer" })).status).toBe(200);
    const team = (await apiRequest("/api/users")).body.users;
    expect(team.map((user: any) => user.id)).toContain(owner.id);
    expect(team.map((user: any) => user.id)).not.toContain(outsider.id);
    state.user = { ...outsider, role: "advisor" };
    for (const [path, method, body] of [[`/api/quotes/saved/${data.quote.id}`, "GET", undefined], [`/api/quotes/saved/${data.quote.id}`, "PATCH", { clientName: "Intruder" }], [`/api/quotes/saved/${data.quote.id}`, "DELETE", undefined], [`/api/quotes/saved/${data.quote.id}/selection`, "POST", undefined]] as const) {
      expect((await apiRequest(path, method, body)).status).toBe(404);
    }
    expect((await apiRequest("/api/pre-analyses")).body.items.some((item: any) => item.id === analysis.id)).toBe(false);
    expect((await apiRequest(`/api/pre-analyses/${analysis.id}/documents/${crypto.randomUUID()}`)).status).toBe(404);
    expect((await apiRequest(`/api/users/${owner.id}/reset-password`, "POST")).status).toBe(404);
    state.user = admin;
  });

  it("enforces account limits atomically across concurrent database requests", async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => consumePersistentLimit("integration-concurrent-account", 3)));
    expect(results.filter(Boolean)).toHaveLength(3);
  });
  it("reads persistent FB history and alerts on an overdue successful update", async () => {
    expect((await persistedFbStatus()).stale).toBe(true);
    await db.insert(schema.stockSyncRuns).values({ source: "automatic", status: "success", finishedAt: new Date() });
    await db.insert(schema.stockSyncRuns).values({ source: "manual", status: "failed", error: "Test failure", finishedAt: new Date() });
    const status = await persistedFbStatus();
    expect(status.history).toHaveLength(2);
    expect(status.stale).toBe(false);
    await db.update(schema.stockSyncRuns).set({ finishedAt: new Date(0) }).where(eq(schema.stockSyncRuns.status, "success"));
    expect((await persistedFbStatus()).alert).toBeTruthy();
  });
  it("retains failed emails and marks a successful retry as delivered", async () => {
    const enabled = config.emailEnabled;
    config.emailEnabled = true;
    try {
      await db.transaction(tx => queueStatusEmail(tx, "Test", "test@example.invalid", "Status", "Test message"));
      vi.mocked(sendStatusEmail).mockRejectedValueOnce(new Error("provider unavailable"));
      await processEmailJobs();
      const [pending] = await db.select().from(schema.emailJobs);
      expect(pending).toMatchObject({ attempts: 1, sentAt: null });
      await db.update(schema.emailJobs).set({ nextAttemptAt: new Date(0) }).where(eq(schema.emailJobs.id, pending.id));
      vi.mocked(sendStatusEmail).mockResolvedValueOnce(undefined);
      await processEmailJobs();
      const [sent] = await db.select().from(schema.emailJobs);
      expect(sent.attempts).toBe(2);
      expect(sent.sentAt).toBeInstanceOf(Date);
      expect(sendStatusEmail).toHaveBeenLastCalledWith("Test", "test@example.invalid", "Status", "Test message", pending.id);
    } finally { config.emailEnabled = enabled; }
  });
  it("commits the email claim before waiting for the external provider", async () => {
    const enabled = config.emailEnabled; config.emailEnabled = true;
    let release!: () => void, sending!: () => void;
    const started = new Promise<void>(resolve => { sending = resolve; });
    vi.mocked(sendStatusEmail).mockImplementationOnce(async () => { sending(); await new Promise<void>(resolve => { release = resolve; }); });
    await db.transaction(tx => queueStatusEmail(tx, "Lease", "lease@example.invalid", "Lease", "Test"));
    const processing = processEmailJobs(); await started;
    try {
      const [claimed] = await db.select().from(schema.emailJobs).where(eq(schema.emailJobs.recipientEmail, "lease@example.invalid"));
      expect(claimed.attempts).toBe(1);
      expect(claimed.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    } finally { release(); await processing; config.emailEnabled = enabled; }
  });
  it("atomically queues document cleanup when deleting a pre-analysis", async () => {
    state.user = admin;
    const [analysis] = await db.insert(schema.preAnalyses).values({ partnerId: owner.id, customerType: "PF", customerName: "Test", document: "52998224725", incomeType: "Test", consentAt: new Date() }).returning();
    await db.insert(schema.preAnalysisDocuments).values({ preAnalysisId: analysis.id, documentType: "Test", fileName: "test.pdf", storagePath: `${analysis.id}/test.pdf`, mimeType: "application/pdf", size: 100 });
    expect((await apiRequest(`/api/pre-analyses/${analysis.id}`, "DELETE")).status).toBe(200);
    expect(await db.select().from(schema.preAnalyses).where(eq(schema.preAnalyses.id, analysis.id))).toHaveLength(0);
    expect(await db.select().from(schema.storageCleanup).where(eq(schema.storageCleanup.path, `${analysis.id}/test.pdf`))).toHaveLength(1);
  });
  it("does not block an independent reservation behind a locked quota", async () => {
    const first = await fixture(), second = await fixture();
    let release!: () => void, locked!: () => void;
    const lockReady = new Promise<void>(resolve => { locked = resolve; });
    const holding = db.transaction(async tx => {
      await tx.select().from(schema.quotas).where(eq(schema.quotas.id, first.quota.id)).for("update");
      locked(); await new Promise<void>(resolve => { release = resolve; });
    });
    await lockReady;
    const blocked = reviewReservation(first.reservation.id, "approved", admin.id);
    try {
      const independent = await Promise.race([reviewReservation(second.reservation.id, "approved", admin.id), new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Independent reservation blocked")), 3000).unref())]);
      expect(independent.item.status).toBe("approved");
    } finally { release(); await holding; await blocked; }
  });
  it("paginates scoped histories without duplicates and filters negotiations in the backend", async () => {
    state.user = admin;
    const first = await request("?pageSize=2"), second = await request("?pageSize=2&page=2");
    expect(first.body.items).toHaveLength(2);
    expect(first.body.hasNext).toBe(true);
    expect(second.body.items.every((item: any) => !first.body.items.some((row: any) => row.id === item.id))).toBe(true);
    const target = first.body.items[0];
    const filtered = await request(`?search=${encodeURIComponent(target.code)}`);
    expect(filtered.body.items.map((item: any) => item.id)).toEqual([target.id]);
  });
  it("refuses approval when a saved quote has outdated stock prices", async () => {
    const data = await fixture();
    await db.update(schema.quotas).set({ entryAmount: "25000.00" }).where(eq(schema.quotas.id, data.quota.id));
    await expect(reviewReservation(data.reservation.id, "approved", admin.id)).rejects.toThrow("Valores atualizados");
    expect((await db.select().from(schema.quotas).where(eq(schema.quotas.id, data.quota.id)))[0].status).toBe("available");
  });
  it("preserves FB identity and prices during spreadsheet replacement", async () => {
    state.user = admin;
    const data = await fixture();
    await db.update(schema.quotas).set({ externalId: "phase1-fb", supplier: "Fraga & Bitello" }).where(eq(schema.quotas.id, data.quota.id));
    const imported = await apiRequest("/api/stock/import/commit", "POST", { mode: "replace", rows: [{ ...data.quota, entryAmount: "1.00" }] });
    expect(imported.status).toBe(200);
    const [quota] = await db.select().from(schema.quotas).where(eq(schema.quotas.id, data.quota.id));
    expect(quota).toMatchObject({ externalId: "phase1-fb", entryAmount: data.quota.entryAmount });
  });
  it("keeps an immutable audit record after permanent negotiation deletion", async () => {
    state.user = admin;
    const data = await fixture();
    const result = await reviewReservation(data.reservation.id, "approved", admin.id);
    const id = result.negotiation!.id;
    expect((await request(`/${id}`, "DELETE", { version: 0 })).status).toBe(200);
    const events = await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.entityId, id));
    expect(events.some(event => event.action === "negotiation.delete")).toBe(true);
    await expect(db.delete(schema.auditEvents).where(eq(schema.auditEvents.entityId, id))).rejects.toThrow();
  });
  it("notifies the requester and deactivates opportunities when stock is reserved", async () => {
    const data = await fixture();
    state.user = advisor;
    expect((await apiRequest(`/api/quotes/saved/${data.quote.id}/opportunity`, "POST", { reason: "Entrada especial de teste" })).status).toBe(200);
    state.user = admin;
    await reviewReservation(data.reservation.id, "approved", admin.id);
    const [quote] = await db.select().from(schema.savedQuotes).where(eq(schema.savedQuotes.id, data.quote.id));
    const messages = await db.select().from(schema.notifications);
    expect(quote.opportunityActive).toBe(false);
    expect(messages.some(item => item.recipientId === owner.id && item.title === "Reserva aprovada")).toBe(true);
    expect(messages.some(item => !item.recipientId && !item.audienceRole && item.title === "Oportunidade encerrada")).toBe(true);
    expect(messages.every(item => item.expiresAt.getTime() > Date.now() + 47 * 60 * 60 * 1000)).toBe(true);
    state.user = owner;
    const visible = await apiRequest("/api/notifications");
    expect(visible.body.items.some((item: { title: string }) => item.title === "Reserva aprovada")).toBe(true);
    state.user = admin;
  });

});
