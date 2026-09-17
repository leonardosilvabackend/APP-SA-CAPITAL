import type { QuoteResponse } from "../QuotePanel";

export function promoCardValues(quote: QuoteResponse) {
  const firstInstallment = quote.summary.installmentCascade[0]?.amount ?? 0;
  return { firstInstallment, averageTerm: firstInstallment > 0 && quote.summary.outstandingBalanceTotal >= 0 ? quote.summary.outstandingBalanceTotal / firstInstallment : null };
}

export const promoAverageTerm = (value: number | null) => value === null ? "Não disponível" : value.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
