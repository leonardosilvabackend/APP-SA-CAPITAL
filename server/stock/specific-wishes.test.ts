import { describe, expect, it } from "vitest";
import { matchesSpecificWish, sameSpecificWish } from "./specific-wishes";
import { specificSearchInputSchema } from "../../shared/stock";

const wish = { id: "w", userId: "u", administrator: "CAIXA", category: "Imóvel", targetCredit: "100000.00", maxEntry: "40000.00", maxInstallment: "1200.00", minTerm: 90, maxTerm: 110, maxBalance: "95000.00", active: true, createdAt: new Date() };
const quota = { code: "100001", administrator: "CAIXA", category: "Imóvel", creditAmount: "100000.00", entryAmount: "35000.00", installmentAmount: "1000.00", installmentCount: 100, outstandingBalance: "90000.00", status: "available" };

describe("pedido específico", () => {
  it("combina todos os limites inclusivos", () => expect(matchesSpecificWish(wish, quota)).toBe(true));
  it("aceita crédito dentro da margem de 2%", () => expect(matchesSpecificWish(wish, { ...quota, creditAmount: 102000 })).toBe(true));
  it.each([
    ["administradora", { administrator: "Outro" }], ["categoria", { category: "Veículo" }],
    ["crédito", { creditAmount: 102001 }], ["entrada", { entryAmount: 40001 }],
    ["parcela", { installmentAmount: 1201 }], ["prazo mínimo", { installmentCount: 89 }],
    ["prazo máximo", { installmentCount: 111 }], ["saldo", { outstandingBalance: 95001 }],
    ["disponibilidade", { status: "reserved" }],
  ])("recusa por %s", (_label, change) => expect(matchesSpecificWish(wish, { ...quota, ...change })).toBe(false));
  it("reconhece pedido repetido apesar dos tipos numéricos", () => expect(sameSpecificWish(wish, { ...wish, targetCredit: 100000 as unknown as string })).toBe(true));
  it.each([['targetCredit',5_000_000],['maxEntry',3_500_000],['maxInstallment',200_000],['maxBalance',8_000_000]])("validates the approved limit for %s", (field, maximum) => {
    expect(specificSearchInputSchema.safeParse({ administrator: "CAIXA", category: "Imóvel", [field]: maximum }).success).toBe(true);
    expect(specificSearchInputSchema.safeParse({ administrator: "CAIXA", category: "Imóvel", [field]: Number(maximum) + 1 }).success).toBe(false);
  });
  it("aceita prazo e saldo devedor ausentes", () => expect(specificSearchInputSchema.safeParse({ administrator: "CAIXA", category: "Imóvel", targetCredit: 100_000 }).success).toBe(true));
});
