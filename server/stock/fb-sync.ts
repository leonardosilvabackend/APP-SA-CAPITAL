import { committedQuota, lockStock } from "./protection";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDatabase } from "../db/client";
import { quotas } from "../db/schema";
import { config } from "../config";
import { normalizeAdministratorName } from "../../shared/administrator-name";

const FB_API_URL = "https://fragaebitelloconsorcios.com.br/api/json/contemplados";
export const FB_SUPPLIER = "Fraga & Bitello";
const MAX_CENTS = 99_999_999_999_999n; // numeric(14, 2)

export class FbSyncError extends Error {
  constructor(message: string, public readonly status = 502) { super(message); }
}

export type FbNormalizedItem = {
  externalId: string; category: string; administrator: string;
  originalCredit: number; credit: number; originalEntry: number; entry: number;
  installments: number; originalInstallmentValue: number; installmentValue: number;
  outstandingBalance: number; status: "available" | "reserved";
  fund: number; nextAdjustment: string | null;
};

const decimal = z.union([z.string().trim().regex(/^\d+(?:\.\d{1,2})?$/), z.number().finite().nonnegative()])
  .transform(value => String(value)).refine(value => /^\d+(?:\.\d{1,2})?$/.test(value), "Valor monetário inválido");
const integer = z.union([z.number().int().positive().max(Number.MAX_SAFE_INTEGER), z.string().trim().regex(/^[1-9]\d*$/)])
  .transform(String);
const apiItemSchema = z.object({
  id: integer.refine(value => value.length <= 120),
  categoria: z.string().trim().min(1).max(80),
  administradora: z.string().trim().min(1).max(160),
  valor_credito: decimal, entrada_sem_comissao: decimal, valor_parcela: decimal,
  parcelas: integer.transform(Number).refine(value => Number.isSafeInteger(value) && value <= 2147483647),
  reserva: z.string().trim().min(1),
  fundo: decimal.optional().default("0"),
  prox_reajuste: z.string().nullable().optional().default(null),
});

function cents(value: string): bigint {
  const [whole, fraction = ""] = value.split(".");
  const result = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (result > MAX_CENTS) throw new FbSyncError("Valor da API FB excede a capacidade do estoque.");
  return result;
}
function money(value: bigint): number {
  if (value > MAX_CENTS) throw new FbSyncError("Valor calculado da FB excede a capacidade do estoque.");
  return Number(value) / 100;
}
const roundRatio = (value: bigint, divisor: bigint) => (value + divisor / 2n) / divisor;

export function normalizeFbStatus(value: string): "available" | "reserved" {
  const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  if (["reservar", "disponivel", "available"].includes(normalized)) return "available";
  if (["reservado", "reservada", "indisponivel", "reserved"].includes(normalized)) return "reserved";
  throw new FbSyncError("Status desconhecido recebido da API FB. Sincronização cancelada.");
}

export function normalizeFbStockResponse(data: unknown): FbNormalizedItem[] {
  if (!Array.isArray(data) || !data.length || data.length > 20000) {
    throw new FbSyncError("Resposta vazia, inválida ou anormal da API FB. Sincronização cancelada.");
  }
  const ids = new Set<string>();
  return data.map((raw, index) => {
    const parsed = apiItemSchema.safeParse(raw);
    if (!parsed.success) throw new FbSyncError(`Dados essenciais inválidos na posição ${index + 1} da API FB. Sincronização cancelada.`);
    const item = parsed.data;
    if (ids.has(item.id)) throw new FbSyncError(`ID duplicado na API FB: ${item.id}. Sincronização cancelada.`);
    ids.add(item.id);
    const originalCredit = cents(item.valor_credito);
    const credit = roundRatio(originalCredit * 999n, 1000n);
    if (!credit) throw new FbSyncError(`Crédito inválido na cota FB ${item.id}.`);
    const originalEntry = cents(item.entrada_sem_comissao);
    const entry = originalEntry + roundRatio(credit * 2n, 100n);
    const originalInstallment = cents(item.valor_parcela);
    const installment = originalInstallment + 170n;
    return {
      externalId: item.id, category: item.categoria, administrator: normalizeAdministratorName(item.administradora),
      originalCredit: money(originalCredit), credit: money(credit),
      originalEntry: money(originalEntry), entry: money(entry),
      installments: item.parcelas, originalInstallmentValue: money(originalInstallment),
      installmentValue: money(installment), outstandingBalance: money(installment * BigInt(item.parcelas)),
      status: normalizeFbStatus(item.reserva), fund: money(cents(item.fundo)), nextAdjustment: item.prox_reajuste,
    };
  });
}

export async function fetchFbStock(): Promise<FbNormalizedItem[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch(FB_API_URL, { signal: controller.signal, headers: { Accept: "application/json" } });
    if (!response.ok) throw new FbSyncError(`Erro HTTP ${response.status} ao consultar API FB. Sincronização cancelada.`);
    return normalizeFbStockResponse(await response.json());
  } catch (error) {
    if (error instanceof FbSyncError) throw error;
    throw new FbSyncError(controller.signal.aborted
      ? "A consulta à API FB excedeu 60 segundos. Sincronização cancelada."
      : "Falha de conexão ou JSON inválido da API FB. Sincronização cancelada.");
  } finally { clearTimeout(timeout); }
}

type LocalQuota = Pick<typeof quotas.$inferSelect, "id" | "code" | "supplier" | "externalId" | "status"> & { protected?: boolean; reservationOrigin?: string | null };
type PlannedItem = FbNormalizedItem & { code: string; localId: string | null };
export type FbSyncPlan = {
  received: number; creates: PlannedItem[]; updates: PlannedItem[]; missing: LocalQuota[];
  wouldReserve: number; wouldReactivate: number; blockingReasons: string[];
};

export function buildFbSyncPlan(items: FbNormalizedItem[], local: LocalQuota[]): FbSyncPlan {
  if (!items.length) throw new FbSyncError("A API FB não retornou cotas. Sincronização cancelada.");
  const integrated = local.filter(item => item.supplier === FB_SUPPLIER && item.externalId?.trim());
  const byExternalId = new Map<string, LocalQuota>();
  for (const item of integrated) {
    if (byExternalId.has(item.externalId!)) throw new FbSyncError(`ID FB duplicado no estoque: ${item.externalId}. Corrija a duplicidade antes de sincronizar.`, 409);
    byExternalId.set(item.externalId!, item);
  }
  const codes = local.map(item => item.code).filter(code => /^\d{6}$/.test(code));
  let nextCode = codes.reduce((largest, code) => Math.max(largest, Number(code)), codes.length ? 0 : 99999);
  const creates: PlannedItem[] = [], updates: PlannedItem[] = [];
  const receivedIds = new Set<string>();
  let wouldReactivate = 0, wouldReserve = 0;
  for (const item of items) {
    if (receivedIds.has(item.externalId)) throw new FbSyncError(`ID FB duplicado: ${item.externalId}.`);
    receivedIds.add(item.externalId);
    const existing = byExternalId.get(item.externalId);
    if (existing) {
      if (existing.protected || existing.status === "sold" || existing.status === "reserved" && existing.reservationOrigin !== "supplier") continue;
      updates.push({ ...item, code: existing.code, localId: existing.id });
      if (existing.status === "reserved" && item.status === "available") wouldReactivate++;
      if (existing.status !== "reserved" && item.status === "reserved") wouldReserve++;
    } else {
      if (++nextCode > 999999) throw new FbSyncError("A sequência de códigos SA ultrapassou 999999.", 409);
      creates.push({ ...item, code: String(nextCode).padStart(6, "0"), localId: null });
    }
  }
  const missing = integrated.filter(item => !receivedIds.has(item.externalId!) && !item.protected && item.status !== "sold" && item.status !== "reserved");
  wouldReserve += missing.length;
  const activeCount = integrated.filter(item => !item.protected && item.status !== "sold" && item.status !== "reserved").length;
  const blockingReasons: string[] = [];
  // Historical missing/reserved quotas are excluded from the baseline to avoid cumulative false alarms.
  if ((activeCount >= 5 && wouldReserve > activeCount * 0.2) || (activeCount >= 2 && wouldReserve === activeCount)) {
    blockingReasons.push(`Resposta suspeita: ${wouldReserve} de ${activeCount} cotas FB não reservadas passariam a reserved. Nenhuma gravação será permitida.`);
  }
  if (integrated.length >= 10 && !items.some(item => byExternalId.has(item.externalId))) {
    blockingReasons.push("Resposta suspeita: nenhum ID recebido corresponde às cotas FB já integradas.");
  }
  return { received: items.length, creates, updates, missing, wouldReserve, wouldReactivate, blockingReasons };
}

const localFields = { id: quotas.id, code: quotas.code, supplier: quotas.supplier, externalId: quotas.externalId, status: quotas.status, reservationOrigin: quotas.reservationOrigin, protected: sql<boolean>`${committedQuota()}` };
function previewOf(plan: FbSyncPlan) {
  return {
    received: plan.received, wouldCreate: plan.creates.length, wouldUpdate: plan.updates.length,
    wouldReserve: plan.wouldReserve, wouldReactivate: plan.wouldReactivate,
    wouldReserveMissing: plan.missing.length,
    canSync: !plan.blockingReasons.length, blockingReasons: plan.blockingReasons,
    samples: { new: plan.creates.slice(0, 20), existing: plan.updates.slice(0, 20), missing: plan.missing.slice(0, 20) },
    sampleLimit: 20,
    note: "Prévia somente leitura. Códigos previstos serão recalculados sob bloqueio na sincronização real.",
  };
}

export async function previewFbStockSync() {
  const db = getDatabase();
  if (!db) throw new FbSyncError("Banco de dados não configurado", 503);
  const items = await fetchFbStock();
  const local = await db.select(localFields).from(quotas);
  return previewOf(buildFbSyncPlan(items, local));
}

export type FbSyncResult = { received: number; created: number; updated: number; reserved: number; reactivated: number };
let syncing = false;
export async function syncFbStock(): Promise<FbSyncResult> {
  if (!config.fbSyncEnabled) throw new FbSyncError("Sincronização FB desabilitada. Configure FB_SYNC_ENABLED=true neste ambiente.", 403);
  if (syncing) throw new FbSyncError("Uma sincronização FB já está em andamento.", 409);
  const db = getDatabase();
  if (!db) throw new FbSyncError("Banco de dados não configurado", 503);
  syncing = true;
  try {
    const items = await fetchFbStock();
    return await db.transaction(async tx => {
      // Cross-process transaction lock: manual action and future jobs share this entry point.
      const [lock] = await tx.execute<{ acquired: boolean }>(sql`select pg_try_advisory_xact_lock(7365, 1) as acquired`);
      if (!lock?.acquired) throw new FbSyncError("Uma sincronização FB já está em andamento.", 409);
      // Block other stock writers only after HTTP succeeds, so max(code)+1 cannot race a manual import.
      await tx.execute(sql`set local lock_timeout = '5s'`);
      await lockStock(tx);
      const local = await tx.select(localFields).from(quotas);
      const plan = buildFbSyncPlan(items, local);
      if (plan.blockingReasons.length) throw new FbSyncError(plan.blockingReasons.join(" "), 409);
      const values = (item: PlannedItem) => ({
        category: item.category, administrator: item.administrator, supplier: FB_SUPPLIER,
        creditAmount: item.credit.toFixed(2), entryAmount: item.entry.toFixed(2),
        installmentCount: item.installments, installmentAmount: item.installmentValue.toFixed(2),
        outstandingBalance: item.outstandingBalance.toFixed(2), status: item.status, reservationOrigin: item.status === "reserved" ? "supplier" : null,
      });
      for (let offset = 0; offset < plan.creates.length; offset += 100) {
        await tx.insert(quotas).values(plan.creates.slice(offset, offset + 100).map(item => ({ ...values(item), code: item.code, externalId: item.externalId, featured: false })));
      }
      for (const item of plan.updates) {
        await tx.update(quotas).set({ ...values(item), updatedAt: new Date() }).where(and(eq(quotas.id, item.localId!), eq(quotas.supplier, FB_SUPPLIER), eq(quotas.externalId, item.externalId), sql`not ${committedQuota()}`));
      }
      for (const item of plan.missing) {
        await tx.update(quotas).set({ status: "reserved", reservationOrigin: "supplier", updatedAt: new Date() }).where(and(eq(quotas.id, item.id), eq(quotas.supplier, FB_SUPPLIER), eq(quotas.externalId, item.externalId!), sql`not ${committedQuota()}`));
      }
      return { received: plan.received, created: plan.creates.length, updated: plan.updates.length, reserved: plan.wouldReserve, reactivated: plan.wouldReactivate };
    });
  } finally { syncing = false; }
}
