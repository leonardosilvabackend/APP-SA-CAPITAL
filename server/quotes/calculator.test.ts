import { describe, expect, it } from "vitest";
import { buildInstallmentCascade, calculateQuote, commercialQuoteText, type CalculationQuota } from "../../shared/quote";

const quotas: CalculationQuota[] = [
  { id: "1", code: "A-01", category: "Imóvel", administrator: "Admin A", creditAmount: 100000, entryAmount: 25000, installmentCount: 150, installmentAmount: 1000, outstandingBalance: 75000 },
  { id: "2", code: "A-02", category: "Imóvel", administrator: "Admin A", creditAmount: 100000, entryAmount: 20000, installmentCount: 180, installmentAmount: 800, outstandingBalance: 60000 },
];

describe("cálculo de cotação", () => {
  it("soma a comissão à entrada sem acréscimo adicional", () => {
    const result = calculateQuote(quotas, 3);
    expect(result.creditTotal).toBe(200000);
    expect(result.baseEntryTotal).toBe(45000);
    expect(result.commissionTotal).toBe(6000);
    expect(result.finalEntryTotal).toBe(51000);
    expect(result.transferFeeTotal).toBe(2600);
    expect(result.entryPercentage).toBeCloseTo(25.5);
  });
  it("gera a cascata de parcelas", () => {
    expect(buildInstallmentCascade(quotas)).toEqual([{ from: 1, to: 150, amount: 1800 }, { from: 151, to: 180, amount: 800 }]);
  });
  it("não revela comissão no texto comercial", () => {
    const text = commercialQuoteText(quotas, 3);
    expect(text).toContain("ENTRADA: R$ 51.000,00");
    expect(text).toContain("25,50%");
    expect(text).not.toContain("6.000");
    expect(text).not.toContain("3%");
  });
});
