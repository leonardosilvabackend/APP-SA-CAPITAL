import { expect, it } from "vitest";
import { moneyCents, moneyNumber, roundRatio, sumMoney } from "./money";
import { calculateQuote } from "./quote";
it("rounds decimal half cents consistently, including negative values", () => {
  expect(moneyCents(1.005)).toBe(101n);
  expect(moneyCents("-1.005")).toBe(-101n);
  expect(moneyNumber(sumMoney(["0.10", "0.20"]))).toBe(0.3);
  expect(roundRatio(10005n, 2n, 100n)).toBe(200n);
  expect(() => moneyNumber(9007199254740992n)).toThrow();
});
it("keeps displayed quote totals consistent with the saved negotiation cents", () => {
  const quota = { id: "test", code: "test", category: "Auto", administrator: "Test", creditAmount: "100.05", entryAmount: "0.10", installmentAmount: "0.10", installmentCount: 1, outstandingBalance: "0.10" };
  expect(calculateQuote([quota, quota, quota], 2)).toMatchObject({ creditTotal: 300.15, baseEntryTotal: 0.3, commissionTotal: 6, finalEntryTotal: 6.3, transferFeeTotal: 3.9 });
});
