import { moneyCents, moneyNumber, roundRatio, sumMoney } from "./money";
import { z } from "zod";

export const quoteCalculationInputSchema = z.object({
  quotaIds: z.array(z.string().uuid()).min(1, "Selecione ao menos uma cota"),
  commissionRate: z.number().min(0).max(8).multipleOf(0.01),
});

export type CalculationQuota = {
  id: string;
  code: string;
  category: string;
  administrator: string;
  creditAmount: number | string;
  entryAmount: number | string;
  installmentCount: number;
  installmentAmount: number | string;
  outstandingBalance: number | string;
};

const number = (value: number | string) => Number(value);

export function insuranceForQuota(quota: Pick<CalculationQuota, "category" | "outstandingBalance">) {
  const category = quota.category.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const numerator = category === "imovel" ? 5511n : category === "veiculo" ? 8811n : 0n;
  return moneyNumber(roundRatio(moneyCents(quota.outstandingBalance), numerator, 10000000n));
}

export function buildInstallmentCascade(quotas: CalculationQuota[]) {
  const endingTerms = Array.from(new Set(quotas.map(quota => quota.installmentCount))).sort((a, b) => a - b);
  let from = 1;
  return endingTerms.map(to => {
    const amount = moneyNumber(sumMoney(quotas.filter(quota => quota.installmentCount >= from).map(quota => quota.installmentAmount)));
    const period = { from, to, amount };
    from = to + 1;
    return period;
  });
}

export function calculateQuote(quotas: CalculationQuota[], commissionRate: number) {
  if (commissionRate < 0 || commissionRate > 8) throw new Error("Comissão fora da faixa permitida");
  const credit = sumMoney(quotas.map(quota => quota.creditAmount));
  const creditTotal = moneyNumber(credit);
  const baseEntryTotal = moneyNumber(sumMoney(quotas.map(quota => quota.entryAmount)));
  const commissionTotal = moneyNumber(roundRatio(credit, moneyCents(commissionRate), 10000n));
  const finalEntryTotal = moneyNumber(sumMoney([baseEntryTotal, commissionTotal]));
  return {
    creditTotal,
    baseEntryTotal,
    commissionRate,
    commissionTotal,
    finalEntryTotal,
    entryPercentage: creditTotal ? finalEntryTotal / creditTotal * 100 : 0,
    outstandingBalanceTotal: moneyNumber(sumMoney(quotas.map(quota => quota.outstandingBalance))),
    transferFeeTotal: moneyNumber(roundRatio(credit, 13n, 1000n)),
    insuranceTotal: moneyNumber(sumMoney(quotas.map(insuranceForQuota))),
    installmentCascade: buildInstallmentCascade(quotas),
  };
}

export function commercialQuoteText(quotas: CalculationQuota[], commissionRate: number) {
  const summary = calculateQuote(quotas, commissionRate);
  const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
  const categories = Array.from(new Set(quotas.map(quota => quota.category.toUpperCase()))).join(" / ");
  const administrators = Array.from(new Set(quotas.map(quota => quota.administrator))).join(" / ");
  return `CARTA DE ${categories}\n\nAdministradora: ${administrators}\n\nCRÉDITO: ${money(summary.creditTotal)}\n\nENTRADA: ${money(summary.finalEntryTotal)} - ${summary.entryPercentage.toFixed(2).replace(".", ",")}%\n\nPRAZO/PARCELA:\n${summary.installmentCascade.map(item => `• ${item.from}ª à ${item.to}ª: ${money(item.amount)}`).join("\n")}\n\nSALDO DEVEDOR: ${money(summary.outstandingBalanceTotal)}\nTAXA DE TRANSFERÊNCIA: ${money(summary.transferFeeTotal)}\nSEGURO DE VIDA: ${money(summary.insuranceTotal)}\n\nCartas selecionadas:\n${quotas.map(quota => `${quota.code}: ${money(number(quota.creditAmount))}`).join("\n")}`;
}
