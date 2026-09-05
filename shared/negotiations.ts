import { z } from "zod";
import type { CalculationQuota } from "./quote";

export const negotiationStatuses = ["awaiting_data", "pending_contract", "awaiting_pre_analysis", "finalized", "cancelled"] as const;
export const negotiationStatusLabels: Record<typeof negotiationStatuses[number], string> = {
  awaiting_data: "AGUARDANDO DADOS",
  pending_contract: "PENDENTE CONTRATO",
  awaiting_pre_analysis: "AGUARDANDO PRÉ-ANÁLISE",
  finalized: "NEGOCIAÇÃO FINALIZADA",
  cancelled: "NEGOCIAÇÃO CANCELADA",
};
export const canEditNegotiation = (role: string) => ["admin", "advisor", "administrative"].includes(role);
export const moneyInput = z.string().regex(/^(0|[1-9]\d{0,11})(\.\d{1,2})?$/, "Informe um valor positivo com até duas casas decimais");
export function cents(value: string) {
  const [whole, fraction = ""] = value.replace(/^-/, "").split(".");
  return (Number(whole) * 100 + Number(fraction.padEnd(2, "0"))) * (value.startsWith("-") ? -1 : 1);
}
export function decimal(value: number) { return (value / 100).toFixed(2); }
export function paymentTotals(entry: string, payments: { amount: string; kind: string }[]) {
  const paid = payments.reduce((sum, payment) => sum + cents(payment.amount), 0);
  const signals = payments.filter(payment => payment.kind === "signal").reduce((sum, payment) => sum + cents(payment.amount), 0);
  return { paidAmount: decimal(paid), signalAmount: decimal(signals), remainingAmount: decimal(cents(entry) - paid) };
}
export const updateNegotiationSchema = z.object({
  version: z.number().int().nonnegative(),
  status: z.enum(negotiationStatuses),
  entryAmount: moneyInput,
  transferFee: moneyInput,
  registrationFee: moneyInput,
  commissionAmount: moneyInput,
}).strict();
export const receiptInputSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(255),
  mimeType: z.enum(["application/pdf", "image/jpeg", "image/png"]),
  base64: z.string().min(4).max(13981016).regex(/^[A-Za-z0-9+/]*={0,2}$/).refine(value => value.length % 4 === 0, "Arquivo inválido")
    .refine(value => value.length * 3 / 4 - (value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0) <= 10 * 1024 * 1024, "O comprovante deve ter até 10 MB"),
});
export const paymentInputSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int().nonnegative(),
  kind: z.enum(["signal", "payment"]),
  amount: moneyInput.refine(value => cents(value) > 0, "Informe um pagamento maior que zero"),
  paidAt: z.string().datetime({ offset: true }),
  receipt: receiptInputSchema.optional(),
}).strict();
export type ReceiptInput = z.infer<typeof receiptInputSchema>;
export type NegotiationReceipt = { id: string; fileName: string; createdAt: string; url: string };
export type NegotiationPayment = {
  id: string; kind: "signal" | "payment"; amount: string; paidAt: string;
  recordedByName: string; createdAt: string; updatedAt: string; receipts: NegotiationReceipt[];
};
export type Negotiation = {
  id: string; code: string; clientName: string; ownerName: string; ownerId: string;
  status: typeof negotiationStatuses[number]; selectedQuotas: CalculationQuota[];
  entryAmount: string; transferFee: string; registrationFee: string; commissionAmount: string;
  creditAmount: string; insuranceAmount: string; outstandingBalance: string;
  createdAt: string; updatedAt: string; version: number;
  paidAmount: string; signalAmount: string; remainingAmount: string;
};
export type NegotiationDetail = Negotiation & { payments: NegotiationPayment[] };
