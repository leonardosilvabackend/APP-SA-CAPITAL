import { eq } from "drizzle-orm";
import { defaultIncomeDocuments } from "../../shared/business";
import { getDatabase } from "../db/client";
import { appSettings, preAnalyses, preAnalysisDocuments } from "../db/schema";

type Database = NonNullable<ReturnType<typeof getDatabase>>;
export type AnalysisTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export class AnalysisError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}
export async function validateSubmission(tx: AnalysisTransaction, item: typeof preAnalyses.$inferSelect) {
  const [settings] = await tx.select().from(appSettings).where(eq(appSettings.id, "default"));
  const required = (settings?.incomeDocuments ?? defaultIncomeDocuments)[item.incomeType];
  if (!required?.length) throw new AnalysisError(400, "Tipo de renda não configurado.");
  const documents = await tx.select().from(preAnalysisDocuments).where(eq(preAnalysisDocuments.preAnalysisId, item.id));
  const missing = required.filter(type => !documents.some(doc => doc.documentType === type && doc.size > 0 && (!doc.expiresAt || doc.expiresAt > new Date())));
  if (missing.length) throw new AnalysisError(409, `Anexe os documentos obrigatórios: ${missing.join(", ")}.`);
}
