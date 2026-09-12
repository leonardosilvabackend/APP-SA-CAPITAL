import { describe, expect, it } from "vitest";
import { createPreAnalysisSchema } from "../../shared/contracts";

describe("validação de pré-análises", () => {
  it("aceita CPF e remove a formatação", () => {
    const result = createPreAnalysisSchema.parse({ customerType: "PF", customerName: "Cliente Teste", document: "529.982.247-25", incomeType: "Autônomo", consent: true });
    expect(result.document).toBe("52998224725");
    expect(result.status).toBe("draft");
  });

  it("exige a quantidade de dígitos correspondente ao tipo", () => {
    expect(createPreAnalysisSchema.safeParse({ customerType: "PJ", customerName: "Empresa Teste", document: "123" }).success).toBe(false);
  });
});

it.each(["approved", "rejected", "received"])("rejects client-controlled status %s", status => {
 expect(createPreAnalysisSchema.safeParse({ customerType: "PF", customerName: "Cliente Teste", document: "52998224725", incomeType: "CLT", consent: true, status }).success).toBe(false);
});
it("rejects invalid check digits and repeated digits", () => {
 for (const document of ["11111111111", "52998224724"]) expect(createPreAnalysisSchema.safeParse({ customerType: "PF", customerName: "Cliente Teste", document, incomeType: "CLT", consent: true }).success).toBe(false);
});
