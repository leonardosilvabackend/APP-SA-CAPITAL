import { describe, expect, it } from "vitest";
import { createPreAnalysisSchema } from "../../shared/contracts";

describe("validação de pré-análises", () => {
  it("aceita CPF e remove a formatação", () => {
    const result = createPreAnalysisSchema.parse({ customerType: "PF", customerName: "Cliente Teste", document: "123.456.789-01" });
    expect(result.document).toBe("12345678901");
    expect(result.status).toBe("draft");
  });

  it("exige a quantidade de dígitos correspondente ao tipo", () => {
    expect(createPreAnalysisSchema.safeParse({ customerType: "PJ", customerName: "Empresa Teste", document: "123" }).success).toBe(false);
  });
});
