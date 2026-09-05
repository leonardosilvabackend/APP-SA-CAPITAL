import { and, asc, eq, inArray } from "drizzle-orm";
import { calculateQuote } from "../../shared/quote";
import { getDatabase } from "../db/client";
import { negotiations, quotas, reservationRequests, savedQuotes } from "../db/schema";

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
    if (status === "approved") {
      const ids = quote.selectedQuotas.map(quota => quota.id);
      if (!ids.length || new Set(ids).size !== ids.length) throw new NegotiationError(409, "A cotação não possui cotas válidas");
      const stock = await tx.select().from(quotas).where(inArray(quotas.id, ids)).orderBy(asc(quotas.id)).for("update");
      if (stock.length !== ids.length || stock.some(quota => quota.status !== "available")) {
        throw new NegotiationError(409, "Uma ou mais cotas já não estão disponíveis para reserva");
      }
      await tx.update(quotas).set({ status: "reserved", updatedAt: new Date() }).where(and(inArray(quotas.id, ids), eq(quotas.status, "available")));
    }
    const [item] = await tx.update(reservationRequests).set({ status, reviewedBy: reviewerId, reviewedAt: new Date() }).where(eq(reservationRequests.id, id)).returning();
    const negotiation = status === "approved" ? await createNegotiation(tx, item, quote) : null;
    return { item, negotiation: negotiation ? { id: negotiation.id, code: negotiation.code } : null };
  });
}

// Run once after migration, before quote cleanup, to include existing approvals.
export async function backfillNegotiations() {
  const db = getDatabase();
  if (!db) throw new NegotiationError(503, "Banco não configurado");
  return db.transaction(async tx => {
    const rows = await tx.select({ reservation: reservationRequests, quote: savedQuotes }).from(reservationRequests)
      .innerJoin(savedQuotes, eq(savedQuotes.id, reservationRequests.quoteId))
      .where(eq(reservationRequests.status, "approved")).orderBy(asc(reservationRequests.reviewedAt));
    for (const row of rows) await createNegotiation(tx, row.reservation, row.quote);
    return rows.length;
  });
}
