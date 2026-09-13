import { lockStock, committedQuota } from "../stock/protection";
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import { calculateQuote } from "../../shared/quote";
import { getDatabase } from "../db/client";
import { negotiations, notifications, quotas, reservationRequests, savedQuotes } from "../db/schema";
import { notificationExpiry } from "../notifications/routes";

export class NegotiationError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
type Database = NonNullable<ReturnType<typeof getDatabase>>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export async function createNegotiation(tx: Transaction, reservation: typeof reservationRequests.$inferSelect, quote: typeof savedQuotes.$inferSelect) {
  const [existing] = await tx.select().from(negotiations).where(eq(negotiations.reservationId, reservation.id));
  if (existing) return existing;
  const summary = calculateQuote(quote.selectedQuotas, Number(quote.commissionRate));
  const [item] = await tx.insert(negotiations).values({
    reservationId: reservation.id, quoteId: quote.id, ownerId: quote.creatorId,
    clientName: quote.clientName, selectedQuotas: quote.selectedQuotas,
    entryAmount: summary.finalEntryTotal.toFixed(2), commissionAmount: summary.commissionTotal.toFixed(2),
    transferFee: summary.transferFeeTotal.toFixed(2), creditAmount: summary.creditTotal.toFixed(2),
    insuranceAmount: summary.insuranceTotal.toFixed(2), outstandingBalance: summary.outstandingBalanceTotal.toFixed(2),
    updatedBy: reservation.reviewedBy,
  }).onConflictDoNothing({ target: negotiations.reservationId }).returning();
  if (item) return item;
  return (await tx.select().from(negotiations).where(eq(negotiations.reservationId, reservation.id)))[0];
}

export async function reviewReservation(id: string, status: "approved" | "rejected", reviewerId: string) {
  const db = getDatabase();
  if (!db) throw new NegotiationError(503, "Banco não configurado");
  return db.transaction(async tx => {
    await lockStock(tx, true);
    const [source] = await tx.select().from(reservationRequests).where(eq(reservationRequests.id, id));
    if (!source) throw new NegotiationError(404, "Pedido não encontrado");
    // Lock the quote before the reservation, matching quote deletion's lock order.
    const [quote] = await tx.select().from(savedQuotes).where(eq(savedQuotes.id, source.quoteId)).for("update");
    if (!quote) throw new NegotiationError(404, "Cotação expirada");
    const [reservation] = await tx.select().from(reservationRequests).where(eq(reservationRequests.id, id)).for("update");
    if (!reservation) throw new NegotiationError(404, "Pedido não encontrado");
    if (reservation.status !== "pending") {
      if (reservation.status !== status) throw new NegotiationError(409, "Esta reserva já foi revisada");
      const [negotiation] = await tx.select().from(negotiations).where(eq(negotiations.reservationId, id));
      return { item: reservation, negotiation: negotiation ? { id: negotiation.id, code: negotiation.code } : null };
    }
    if (quote.expiresAt <= new Date()) throw new NegotiationError(409, "A cotação expirou. Gere uma nova cotação");
    const ids = quote.selectedQuotas.map(quota => quota.id);
    if (status === "approved") {
      if (!ids.length || new Set(ids).size !== ids.length) throw new NegotiationError(409, "A cotação não possui cotas válidas");
      const stock = await tx.select().from(quotas).where(inArray(quotas.id, ids)).orderBy(asc(quotas.id)).for("update");
      if (stock.length !== ids.length || stock.some(quota => quota.status !== "available")) {
        throw new NegotiationError(409, "Uma ou mais cotas já não estão disponíveis para reserva");
      }
      const priceFields = ["creditAmount", "entryAmount", "installmentAmount", "outstandingBalance", "installmentCount"] as const;
      const changed = quote.selectedQuotas.filter(snapshot => {
        const current = stock.find(row => row.id === snapshot.id)!;
        return current.administrator !== snapshot.administrator || current.category !== snapshot.category || priceFields.some(field => Number(current[field]) !== Number(snapshot[field]));
      });
      if (changed.length) throw new NegotiationError(409, `Valores atualizados nas cotas ${changed.map(q => q.code).join(", ")}. Gere uma nova cotacao antes de reservar.`);
      await tx.update(quotas).set({ status: "reserved", reservationOrigin: "negotiation", updatedAt: new Date() }).where(and(inArray(quotas.id, ids), eq(quotas.status, "available")));
    }
    const [item] = await tx.update(reservationRequests).set({ status, reviewedBy: reviewerId, reviewedAt: new Date() }).where(eq(reservationRequests.id, id)).returning();
    const negotiation = status === "approved" ? await createNegotiation(tx, item, quote) : null;
    const codes = quote.selectedQuotas.map(quota => quota.code).join(", ");
    await tx.insert(notifications).values({ recipientId: reservation.requesterId, title: status === "approved" ? "Reserva aprovada" : "Reserva reprovada", message: status === "approved" ? `Sua solicitação de reserva das cotas: ${codes}, foi aprovada!` : `Sua reserva das cotas: ${codes}, foi reprovada.`, link: status === "approved" && negotiation ? `/negociacoes?id=${negotiation.id}` : `/cotacoes?id=${quote.id}`, expiresAt: notificationExpiry() });
    if (status === "approved") {
      const affected = new Set<string>();
      for (const quotaId of ids) {
        const rows = await tx.update(savedQuotes).set({ opportunityActive: false }).where(and(eq(savedQuotes.opportunityActive, true), sql`exists (select 1 from jsonb_array_elements(${savedQuotes.selectedQuotas}) item where item->>'id' = ${quotaId})`)).returning({ id: savedQuotes.id });
        rows.forEach(row => affected.add(row.id));
      }
      if (affected.size) await tx.insert(notifications).values({ title: "Oportunidade encerrada", message: `A oportunidade com as cotas ${codes} não está mais disponível.`, expiresAt: notificationExpiry() });
    }
    return { item, negotiation: negotiation ? { id: negotiation.id, code: negotiation.code } : null };
  });
}

// Run once after migration, before quote cleanup, to include existing approvals.
export async function backfillNegotiations() {
  const db = getDatabase();
  if (!db) throw new NegotiationError(503, "Banco não configurado");
  return db.transaction(async tx => {
    await lockStock(tx);
    const rows = await tx.select({ reservation: reservationRequests, quote: savedQuotes }).from(reservationRequests)
      .innerJoin(savedQuotes, eq(savedQuotes.id, reservationRequests.quoteId))
      .where(eq(reservationRequests.status, "approved")).orderBy(asc(reservationRequests.reviewedAt));
    for (const row of rows) await createNegotiation(tx, row.reservation, row.quote);
    return rows.length;
  });
}

// Caller holds the stock lock and the negotiation row lock.
export async function releaseNegotiationStock(tx: Transaction, item: typeof negotiations.$inferSelect) {
  if (item.status === "cancelled") return; // Do not release a quota sold again after an earlier cancellation.
  for (const quota of item.selectedQuotas) {
    // Recover snapshots lost by the old destructive import, without overwriting a newer stock identity.
    await tx.insert(quotas).values({ id: quota.id, code: quota.code, category: quota.category, administrator: quota.administrator, installmentCount: quota.installmentCount, creditAmount: String(quota.creditAmount), entryAmount: String(quota.entryAmount), installmentAmount: String(quota.installmentAmount), outstandingBalance: String(quota.outstandingBalance), status: "available" }).onConflictDoNothing();
    await tx.update(quotas).set({ status: "available", reservationOrigin: null, updatedAt: new Date() }).where(and(or(eq(quotas.id, quota.id), eq(quotas.code, quota.code)), sql`not ${committedQuota(item.id)}`));
  }
  // Prevent startup backfill from resurrecting a deleted negotiation.
  await tx.update(reservationRequests).set({ status: "cancelled", reviewedAt: new Date() }).where(eq(reservationRequests.id, item.reservationId));
}
