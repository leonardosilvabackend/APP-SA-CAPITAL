import { moneyCents, moneyNumber, roundRatio } from "../../shared/money";
import type { QuotaInput } from "../../shared/stock";

export const SA_IMPORT_ENTRY_PERCENT = 3;

export function saImportValues(data: QuotaInput) {
  const credit = moneyCents(data.creditAmount);
  const originalEntry = moneyCents(data.entryAmount);
  return {
    ...data,
    sourceCode: data.code.trim(),
    creditAmount: moneyNumber(credit).toFixed(2),
    entryAmount: moneyNumber(originalEntry + roundRatio(credit, BigInt(SA_IMPORT_ENTRY_PERCENT), 100n)).toFixed(2),
    installmentAmount: moneyNumber(moneyCents(data.installmentAmount)).toFixed(2),
    outstandingBalance: moneyNumber(moneyCents(data.outstandingBalance)).toFixed(2),
    reservationOrigin: data.status === "reserved" ? "manual" : null,
  };
}

export function saImportSourceKey(supplier: string | null | undefined, sourceCode: string) {
  return `${supplier?.trim().toLocaleLowerCase("pt-BR") ?? ""}\u0000${sourceCode.trim().toLocaleLowerCase("pt-BR")}`;
}
