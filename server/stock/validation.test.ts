import { describe, expect, it } from "vitest";
import { quotaInputSchema, validateImportRows } from "../../shared/stock";

describe("validação de estoque", () => {
  const valid = { code: "A-123", category: "Imóvel", administrator: "Administradora", creditAmount: "R$ 150.000,00", entryAmount: "30.000,00", installmentCount: "120", installmentAmount: "1.250,50", outstandingBalance: "120.000,00" };
  it("converte valores brasileiros", () => {
    const parsed = quotaInputSchema.parse(valid);
    expect(parsed.creditAmount).toBe(150000);
    expect(parsed.installmentAmount).toBe(1250.5);
    expect(parsed.status).toBe("available");
  });
  it("recusa códigos repetidos na mesma importação", () => {
    const rows = validateImportRows([valid, { ...valid, code: "a-123" }]);
    expect(rows[0].valid).toBe(true);
    expect(rows[1].valid).toBe(false);
  });
});
