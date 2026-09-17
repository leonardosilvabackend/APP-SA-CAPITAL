import { expect, it } from "vitest";
import { calculateQuote, type CalculationQuota } from "@shared/quote";
import { promoAverageTerm, promoCardValues, promoDesigns } from "./promo-card";
const quotas: CalculationQuota[] = [{ id: "a", code: "a", administrator: "A", category: "Imóvel", creditAmount: 100000, entryAmount: 20000, installmentCount: 10, installmentAmount: 1000, outstandingBalance: 10000 }, { id: "b", code: "b", administrator: "A", category: "Imóvel", creditAmount: 100000, entryAmount: 20000, installmentCount: 20, installmentAmount: 500, outstandingBalance: 10000 }];
it("uses total balance divided by the first cascade amount, preserving fractional terms", () => {
  const quote = { quotas, summary: calculateQuote(quotas, 0), commercialText: "" };
  expect(promoCardValues(quote)).toEqual({ firstInstallment: 1500, averageTerm: 20000 / 1500 });
  expect(promoCardValues({ ...quote, summary: { ...quote.summary, installmentCascade: [] } }).averageTerm).toBeNull();
});
it.each([[40, "40"], [40.16, "40,16"], [40.1, "40,1"], [40.004, "40"], [null, "Não disponível"]])("formats average term %s without unnecessary decimals", (value, expected) => {
  expect(promoAverageTerm(value as number | null)).toBe(expected);
});
it("offers truck artwork only for vehicle quotes and two house designs for property",()=>{
 const quote={quotas,summary:calculateQuote(quotas,0),commercialText:""};
 expect(promoDesigns(quote).map(d=>d.id)).toEqual(["modern","highlight"]);
 expect(promoDesigns({...quote,quotas:quotas.map(q=>({...q,category:"Veículo"}))}).map(d=>d.id)).toEqual(["modern","highlight","truck"]);
});
