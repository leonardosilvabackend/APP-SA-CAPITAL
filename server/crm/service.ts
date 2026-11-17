import { and, desc, eq } from "drizzle-orm";
import { crmDealHistory, crmDeals, crmPipelines, crmPipelineStages, negotiations, users } from "../db/schema";
import type { getDatabase } from "../db/client";

type Database = NonNullable<ReturnType<typeof getDatabase>>;
export type CrmTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export async function syncApprovedNegotiation(tx: CrmTransaction, negotiation: typeof negotiations.$inferSelect, actorId: string) {
  const owner = (await tx.select({ organizationId: users.organizationId }).from(users).where(eq(users.id, negotiation.ownerId)))[0];
  const pipeline = (await tx.select().from(crmPipelines).where(eq(crmPipelines.organizationId, owner.organizationId!)).orderBy(desc(crmPipelines.isDefault)).limit(1))[0];
  const reservationStage = (await tx.select().from(crmPipelineStages).where(and(eq(crmPipelineStages.pipelineId, pipeline.id), eq(crmPipelineStages.systemKey, "reservation"))).limit(1))[0] ?? (await tx.select().from(crmPipelineStages).where(eq(crmPipelineStages.pipelineId, pipeline.id)).orderBy(crmPipelineStages.position).limit(1))[0];
  const categories = Array.from(new Set(negotiation.selectedQuotas.map(q => q.category))).join(" / ");
  const administrators = Array.from(new Set(negotiation.selectedQuotas.map(q => q.administrator))).join(" / ");
  const existing = (await tx.select().from(crmDeals).where(eq(crmDeals.negotiationId, negotiation.id)).for("update"))[0];
  if (existing) {
    if (existing.stage !== "reservation") await tx.insert(crmDealHistory).values({ dealId: existing.id, actorId, action: "reservation.approved", previousStage: existing.stage, nextStage: "reservation", details: { negotiationId: negotiation.id } });
    await tx.update(crmDeals).set({ stage: "reservation", stageId: reservationStage.id, pipelineId: pipeline.id, organizationId: owner.organizationId!, result: reservationStage.resultType, ownerId: negotiation.ownerId, name: negotiation.clientName, creditAmount: negotiation.creditAmount, category: categories || null, administrator: administrators || null, version: existing.version + 1, updatedAt: new Date() }).where(eq(crmDeals.id, existing.id));
    return existing.id;
  }
  const [deal] = await tx.insert(crmDeals).values({ organizationId: owner.organizationId!, pipelineId: pipeline.id, stageId: reservationStage.id, result: reservationStage.resultType, ownerId: negotiation.ownerId, name: negotiation.clientName, creditAmount: negotiation.creditAmount, category: categories || null, administrator: administrators || null, stage: "reservation", source: "reservation", negotiationId: negotiation.id }).returning();
  await tx.insert(crmDealHistory).values({ dealId: deal.id, actorId, action: "reservation.approved", nextStage: "reservation", details: { negotiationId: negotiation.id, reservationId: negotiation.reservationId } });
  return deal.id;
}

export async function syncCancelledNegotiation(tx: CrmTransaction, negotiationId: string, actorId: string) {
  const deal = (await tx.select().from(crmDeals).where(eq(crmDeals.negotiationId, negotiationId)).for("update"))[0];
  if (!deal) return;
  const lostStage = (await tx.select().from(crmPipelineStages).where(and(eq(crmPipelineStages.pipelineId, deal.pipelineId!), eq(crmPipelineStages.systemKey, "lost"))).limit(1))[0];
  await tx.update(crmDeals).set({ stage: "lost", ...(lostStage ? { stageId: lostStage.id, result: "lost" as const } : {}), version: deal.version + 1, updatedAt: new Date() }).where(eq(crmDeals.id, deal.id));
  await tx.insert(crmDealHistory).values({ dealId: deal.id, actorId, action: "reservation.cancelled", previousStage: deal.stage, nextStage: "lost", details: { negotiationId } });
}

