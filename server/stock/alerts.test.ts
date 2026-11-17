import { describe, expect, it } from "vitest";
import { hasAlertCriteria, matchesStockAlert, matchNotificationText } from "./alerts";
const quota = { administrator: "CAIXA", category: "Veículos", creditAmount: 100000, entryAmount: 30000, installmentCount: 100, outstandingBalance: 70000, status: "available" };
describe("alertas de estoque", () => {
  it("recusa alerta vazio", () => expect(hasAlertCriteria({})).toBe(false));
  it("combina administradora", () => expect(matchesStockAlert({ administrator: "CAIXA" }, quota)).toBe(true));
  it("combina categoria", () => expect(matchesStockAlert({ category: "Imóveis" }, quota)).toBe(false));
  it("combina percentual de entrada", () => expect(matchesStockAlert({ maxEntryPercent: 29 }, quota)).toBe(false));
  it("aceita prazo na margem fixa de 10 meses", () => expect(matchesStockAlert({ averageTerm: 110 }, quota)).toBe(true));
  it("recusa prazo fora da margem", () => expect(matchesStockAlert({ averageTerm: 112 }, quota)).toBe(false));
  it("combina saldo abaixo do crédito", () => expect(matchesStockAlert({ outstandingBalanceRelation: "below_credit" }, quota)).toBe(true));
  it("recusa saldo quando deveria estar acima do crédito", () => expect(matchesStockAlert({ outstandingBalanceRelation: "above_credit" }, quota)).toBe(false));
  it("considera somente disponíveis", () => expect(matchesStockAlert({ category: "Veículos" }, { ...quota, status: "reserved" })).toBe(false));
  it("consolida mais de três", () => expect(matchNotificationText(4)).toBe("+3 cotas dentro do seu gosto no estoque!"));
});
