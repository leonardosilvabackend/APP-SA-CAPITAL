import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config", () => ({ config: { fbSyncEnabled: true } }));
const state = vi.hoisted(() => ({ db: null as any }));
vi.mock("../db/client", () => ({ getDatabase: () => state.db }));
import { buildFbSyncPlan, FB_SUPPLIER, fetchFbStock, normalizeFbStockResponse, previewFbStockSync, syncFbStock } from "./fb-sync";

const raw = { id: 7288, categoria: "Veículo", valor_credito: "34805.00", entrada_sem_comissao: "15400.00", parcelas: 15, valor_parcela: "1787.00", administradora: "Magalu", reserva: "Reservar", fundo: "0.00", prox_reajuste: null };
const normalized = (extra = {}) => normalizeFbStockResponse([{ ...raw, ...extra }])[0];
const local = (externalId: string | null, code = "100428", status = "available", supplier = FB_SUPPLIER) => ({ id: `local-${code}`, externalId, code, status: status as "available" | "reserved", supplier, reservationOrigin: status === "reserved" ? "supplier" : null });
const remote = vi.fn();
beforeEach(() => { state.db = null; remote.mockReset().mockResolvedValue({ ok: true, json: async () => [raw] }); vi.stubGlobal("fetch", remote); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("FB normalization", () => {
  it("applies the commercial adjustments using rounded cents", () => {
    expect(normalized()).toMatchObject({ externalId: "7288", originalCredit: 34805, credit: 34801.52, originalEntry: 15400, entry: 16096.03, originalInstallmentValue: 1787, installmentValue: 1788.7, installments: 15, outstandingBalance: 26830.5, status: "available" });
  });
  it("uses adjusted credit for entry and handles half-cent rounding", () => {
    expect(normalized({ valor_credito: "50.00", entrada_sem_comissao: 0 })).toMatchObject({ credit: 50, entry: 1 });
    expect(normalized({ valor_credito: "150.00", entrada_sem_comissao: 0 })).toMatchObject({ credit: 149.99, entry: 3 });
  });
  it("distinguishes Reservar from Reservado", () => {
    expect(normalized({ reserva: "Reservado" }).status).toBe("reserved");
    expect(normalized({ reserva: "Disponível" }).status).toBe("available");
    expect(() => normalized({ reserva: "???" })).toThrow("Status desconhecido");
  });
  it.each([{ valor_credito: null }, { valor_credito: "" }, { valor_credito: "0" }, { entrada_sem_comissao: -1 }, { parcelas: 1.5 }, { parcelas: 0 }, { id: null }, { categoria: " " }, { administradora: "" }, { valor_parcela: "NaN" }, { valor_parcela: "999999999999.99", parcelas: 100 }])("rejects essential invalid values: %j", changes => {
    expect(() => normalized(changes)).toThrow();
  });
  it("rejects duplicate IDs and empty or malformed lists", () => {
    for (const data of [[], {}, null, [raw, raw]]) expect(() => normalizeFbStockResponse(data)).toThrow();
  });
  it.each(["http", "json", "network", "empty"])("cancels %s failures", async kind => {
    if (kind === "http") remote.mockResolvedValue({ ok: false, status: 503 });
    if (kind === "json") remote.mockResolvedValue({ ok: true, json: async () => { throw new SyntaxError(); } });
    if (kind === "network") remote.mockRejectedValue(new Error("offline"));
    if (kind === "empty") remote.mockResolvedValue({ ok: true, json: async () => [] });
    await expect(fetchFbStock()).rejects.toThrow("cancelada");
  });
  it("aborts the request at 60 seconds", async () => {
    vi.useFakeTimers();
    remote.mockImplementation((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(new Error("aborted")))));
    const assertion = expect(fetchFbStock()).rejects.toThrow("60 segundos");
    await vi.advanceTimersByTimeAsync(60000);
    await assertion;
  });
});

describe("FB planning", () => {
  it("generates global six-digit sequential codes and ignores alphanumeric codes", () => {
    const plan = buildFbSyncPlan([normalized(), normalized({ id: 7289 })], [local(null, "100428", "available", "Other"), local(null, "SA1516"), local(null, "RS95"), local(null, "39576-9")]);
    expect(plan.creates.map(item => item.code)).toEqual(["100429", "100430"]);
    expect(buildFbSyncPlan([normalized()], [local(null, "000123")]).creates[0].code).toBe("000124");
    expect(buildFbSyncPlan([normalized()], []).creates[0].code).toBe("100000");
  });
  it("preserves an existing code and reactivates returning stock", () => {
    const plan = buildFbSyncPlan([normalized()], [local("7288", "SA95", "reserved")]);
    expect(plan.creates).toHaveLength(0); expect(plan.updates[0].code).toBe("SA95"); expect(plan.wouldReactivate).toBe(1);
  });
  it("reserves missing integrated FB stock only", () => {
    const plan = buildFbSyncPlan([normalized()], [local("7288"), local("gone", "100429"), local("another", "100430", "available", "Other"), local(null, "100431"), local("", "100432")]);
    expect(plan.missing.map(item => item.code)).toEqual(["100429"]);
    expect(plan.wouldReserve).toBe(1);
  });
  it("does not match IDs belonging to other suppliers", () => {
    const plan = buildFbSyncPlan([normalized()], [local("7288", "100100", "available", "Other")]);
    expect(plan.creates[0].code).toBe("100101"); expect(plan.updates).toHaveLength(0); expect(plan.missing).toHaveLength(0);
  });
  it("detects abnormal disappearance and mass reservation", () => {
    const locals = Array.from({ length: 10 }, (_, i) => local(String(7288 + i), String(100100 + i)));
    expect(buildFbSyncPlan([normalized()], locals).blockingReasons.length).toBeGreaterThan(0);
    const reserved = locals.map(item => normalized({ id: Number(item.externalId), reserva: "Reservado" }));
    expect(buildFbSyncPlan(reserved, locals).blockingReasons.length).toBeGreaterThan(0);
  });
  it("fails before writes on local duplicates or exhausted codes", () => {
    expect(() => buildFbSyncPlan([normalized()], [local("7288"), local("7288", "100429")])).toThrow("duplicado");
    expect(() => buildFbSyncPlan([normalized()], [local(null, "999999")])).toThrow("999999");
  });
});

// In-memory transaction double: never connects to the application database.
function databaseFixture(initial: ReturnType<typeof local>[]) {
  let rows: any[] = structuredClone(initial);
  const executions: string[] = [];
  const writes = vi.fn();
  let failAt = Infinity, acquired = true;
  const select = (read: () => any[]) => () => ({ from: async () => structuredClone(read()) });
  const db = {
    select: vi.fn(select(() => rows)),
    transaction: vi.fn(async (callback: (tx: any) => Promise<unknown>) => {
      const working = structuredClone(rows);
      const tx = {
        execute: async (statement: SQL) => { executions.push(new PgDialect().sqlToQuery(statement).sql); return [{ acquired }]; },
        select: select(() => working),
        insert: () => ({ values: async (items: any[]) => {
          writes("insert", items); if (writes.mock.calls.length === failAt) throw new Error("write failed");
          working.push(...items.map(item => ({ ...item, id: `local-${item.code}` })));
        } }),
        update: () => ({ set: (changes: any) => ({ where: async (condition: SQL) => {
          const params = new PgDialect().sqlToQuery(condition).params;
          writes("update", changes); if (writes.mock.calls.length === failAt) throw new Error("write failed");
          const row = working.find(item => item.id === params[0] && item.supplier === params[1] && item.externalId === params[2]);
          if (row) Object.assign(row, changes);
        } }) }),
      };
      const result = await callback(tx);
      rows = working;
      return result;
    }),
  };
  state.db = db;
  return { db, writes, executions, rows: () => rows, fail: (at = 1) => { failAt = at; }, denyLock: () => { acquired = false; } };
}

describe("FB preview and sync isolation", () => {
  it("preview reads real fetch output without any database writes or transaction", async () => {
    const fixture = databaseFixture([local(null, "100428", "available", "Other")]);
    const before = structuredClone(fixture.rows());
    const result = await previewFbStockSync();
    expect(result).toMatchObject({ received: 1, wouldCreate: 1, wouldUpdate: 0, wouldReserve: 0, wouldReactivate: 0, canSync: true });
    expect(result.samples.new[0]).toMatchObject({ externalId: "7288", code: "100429", originalCredit: 34805, credit: 34801.52 });
    expect(fixture.rows()).toEqual(before); expect(fixture.writes).not.toHaveBeenCalled(); expect(fixture.db.transaction).not.toHaveBeenCalled();
  });
  it("returns suspicious preview counts but prevents real writes", async () => {
    const fixture = databaseFixture(Array.from({ length: 10 }, (_, i) => local(String(7288 + i), String(100100 + i))));
    expect(await previewFbStockSync()).toMatchObject({ canSync: false, wouldReserve: 9 });
    await expect(syncFbStock()).rejects.toThrow("suspeita"); expect(fixture.writes).not.toHaveBeenCalled();
  });
  it("sync preserves codes, reactivates, reserves missing and leaves other suppliers untouched", async () => {
    const other = local("external", "100500", "available", "Other");
    const fixture = databaseFixture([local("7288", "100428", "reserved"), local("gone", "100429"), other]);
    remote.mockResolvedValue({ ok: true, json: async () => [raw, { ...raw, id: 7289 }] });
    expect(await syncFbStock()).toMatchObject({ created: 1, updated: 1, reserved: 1, reactivated: 1 });
    expect(fixture.rows().find(item => item.externalId === "7288")).toMatchObject({ code: "100428", status: "available" });
    expect(fixture.rows().find(item => item.externalId === "7289")).toMatchObject({ code: "100501" });
    expect(fixture.rows().find(item => item.externalId === "gone").status).toBe("reserved");
    expect(fixture.rows().find(item => item.id === other.id)).toEqual(other);
    expect(fixture.executions).toContain('lock table "quotas" in share row exclusive mode');
  });
  it("a repeated sync never creates the same external ID twice", async () => {
    const fixture = databaseFixture([]);
    await syncFbStock(); await syncFbStock();
    expect(fixture.rows()).toHaveLength(1); expect(fixture.rows()[0].code).toBe("100000");
  });
  it("API failure never reserves stock", async () => {
    const fixture = databaseFixture([local("gone")]);
    remote.mockRejectedValue(new Error("offline"));
    await expect(syncFbStock()).rejects.toThrow("cancelada");
    expect(fixture.writes).not.toHaveBeenCalled(); expect(fixture.rows()[0].status).toBe("available");
  });
  it("database failure rolls back and releases the in-process guard", async () => {
    const fixture = databaseFixture([local("gone")]); fixture.fail(2);
    const before = structuredClone(fixture.rows());
    await expect(syncFbStock()).rejects.toThrow("write failed");
    expect(fixture.rows()).toEqual(before);
    const fresh = databaseFixture([]); await syncFbStock(); expect(fresh.rows()).toHaveLength(1);
  });
  it("a database advisory lock held elsewhere prevents writes after HTTP preflight", async () => {
    const fixture = databaseFixture([]); fixture.denyLock();
    await expect(syncFbStock()).rejects.toThrow("andamento");
    expect(remote).toHaveBeenCalledOnce(); expect(fixture.writes).not.toHaveBeenCalled();
  });
  it("rejects concurrent manual/job calls through the same entry point", async () => {
    databaseFixture([]);
    let resolveFetch!: (value: unknown) => void;
    remote.mockImplementationOnce(() => new Promise(resolve => { resolveFetch = resolve; }));
    const first = syncFbStock();
    await vi.waitFor(() => expect(remote).toHaveBeenCalledOnce());
    await expect(syncFbStock()).rejects.toThrow("andamento");
    resolveFetch({ ok: true, json: async () => [raw] });
    await first;
  });
});

it("preserves negotiated and sold stock without reporting reactivation", () => {
  const plan = buildFbSyncPlan([normalized()], [{ ...local("7288", "100428", "reserved"), protected: true }]);
  expect(plan.updates).toHaveLength(0);
  expect(plan.wouldReactivate).toBe(0);
  const sold = buildFbSyncPlan([normalized()], [{ ...local("7288"), status: "sold" }]);
  expect(sold.updates).toHaveLength(0);
});

it("uses the supplier commission-free entry for the supplied examples", () => {
  expect(normalized({ id: 14601, valor_credito: "24709.00", entrada: 11900, entrada_sem_comissao: "9900.00" })).toMatchObject({ originalEntry: 9900, entry: 10394.13 });
  expect(normalized({ id: 14622, valor_credito: "25426.00", entrada: 13100, entrada_sem_comissao: "11000.00" })).toMatchObject({ originalEntry: 11000, entry: 11508.47 });
});
it.each([undefined, null, "", -1])("rejects missing or invalid commission-free entry: %s", value => {
  expect(() => normalized({ entrada: 11900, entrada_sem_comissao: value })).toThrow();
});

it("preserves a manual reservation even when FB marks the quota available", () => {
 const plan = buildFbSyncPlan([normalized()], [{ ...local("7288", "100428", "reserved"), reservationOrigin: "manual" }]);
 expect(plan.updates).toHaveLength(0);
 expect(plan.wouldReactivate).toBe(0);
});
