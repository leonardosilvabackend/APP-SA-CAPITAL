import { expect, it } from "vitest";
import type { CalculationQuota } from "../../shared/quote";
import { quotaInputSchema, validateImportRows, type SmartSearchInput } from "../../shared/stock";
import { findSmartCombination } from "./smart-search";

const input: SmartSearchInput = { category: "Imóvel", administrator: "", targetCredit: 100, priority: "entry" };
const quota = (id: string, credit: number, entry = 20, installment = 1, balance = 70, administrator = "A"): CalculationQuota => ({
  id, code: id, creditAmount: credit.toFixed(2), entryAmount: entry.toFixed(2), installmentAmount: installment.toFixed(2), outstandingBalance: balance.toFixed(2), administrator, category: "Imóvel", installmentCount: 120,
});
it("accepts a single quota and inclusive boundaries", async () => {
  for (const credit of [98, 100, 102]) expect((await findSmartCombination([quota("1", credit)], input)).items).toHaveLength(1);
  for (const credit of [97.99, 102.01]) expect((await findSmartCombination([quota("1", credit)], input)).items).toHaveLength(0);
});
it("finds two, three and many quotas without reusing any quota", async () => {
  for (const count of [2, 4, 10]) {
    const result = await findSmartCombination(Array.from({ length: count }, (_, i) => quota(String(i), 100 / count)), input);
    expect(result.items).toHaveLength(count); expect(result.summary?.creditTotal).toBe(100); expect(result.complete).toBe(true);
  }
  expect((await findSmartCombination([quota("1", 30), quota("2", 30), quota("3", 40)], input)).items).toHaveLength(3);
});
it("compares weighted totals, not simple averages or absolute amounts", async () => {
  const result = await findSmartCombination([quota("single", 98, 35), quota("small", 20, 0), quota("large", 80, 36)], input);
  // A simple average would incorrectly score the pair at 22.5%; its actual ratio is 36%.
  expect(result.items.map(q => q.id)).toEqual(["single"]);
  const percentage = await findSmartCombination([quota("lower-value", 98, 35), quota("lower-ratio", 102, 36)], input);
  expect(percentage.items[0].id).toBe("lower-ratio");
});
it.each(["entry", "installment", "balance"] as const)("selects by %s percentage alone", async priority => {
  const stock = [quota("a", 100, 10, 9, 70), quota("b", 100, 30, 1, 80), quota("c", 100, 40, 7, -10)];
  const result = await findSmartCombination(stock, { ...input, priority });
  expect(result.items[0].id).toBe({ entry: "a", installment: "b", balance: "c" }[priority]);
});
it("preserves negative balance percentages in combined sums", async () => {
  const result = await findSmartCombination([quota("one", 100, 20, 1, -5), quota("two", 40, 20, 1, -6), quota("three", 60, 20, 1, -4)], { ...input, priority: "balance" });
  expect(result.items).toHaveLength(2); expect(result.summary?.criterionPercentage).toBe(-10);
});
it("never mixes administrators, even for All, and keeps the category", async () => {
  const stock = [quota("a", 40), quota("b", 60, 20, 1, 70, "B"), { ...quota("vehicle", 100, 0), category: "Veículo" }];
  expect((await findSmartCombination(stock, input)).items).toHaveLength(0);
  expect((await findSmartCombination(stock, { ...input, administrator: "A" })).items).toHaveLength(0);
});
it("compares valid combinations from all administrators by the selected ratio", async () => {
  const stock = [quota("a1", 40, 4), quota("a2", 60, 18), quota("b1", 50, 10, 1, 70, "B"), quota("b2", 50, 10, 1, 70, "B")];
  const result = await findSmartCombination(stock, input);
  expect(result.items.map(item => item.id).sort()).toEqual(["b1", "b2"]);
  expect(result.summary?.criterionPercentage).toBe(20);
  const specific = await findSmartCombination(stock, { ...input, administrator: "A" });
  expect(specific.items.map(item => item.id).sort()).toEqual(["a1", "a2"]);
});
it("breaks percentage ties by target distance, then count", async () => {
  const stock = [quota("single-far", 98, 19.6), quota("part1", 40, 8), quota("part2", 60, 12)];
  expect((await findSmartCombination(stock, input)).items).toHaveLength(2);
  expect((await findSmartCombination([...stock, quota("single-close", 100, 20)], input)).items.map(q => q.id)).toEqual(["single-close"]);
});
it("uses absolute criterion value only as the last tie-breaker", async () => {
  const result = await findSmartCombination([quota("upper", 102, 20.4), quota("lower", 98, 19.6)], input);
  expect(result.items[0].id).toBe("lower");
});
it("keeps the API responsive on a large stock with a bounded search", async () => {
  const stock = Array.from({ length: 20000 }, (_, i) => quota(String(i), 1, 0.2));
  let timerRan = false;
  const timer = setTimeout(() => { timerRan = true; }, 0);
  const result = await findSmartCombination(stock, input, { maxNodes: 4096, maxMs: 250 });
  clearTimeout(timer);
  expect(timerRan).toBe(true);
  expect(result.complete).toBe(false);
  expect(result.summary!.creditTotal).toBeGreaterThanOrEqual(98);
  expect(result.summary!.creditTotal).toBeLessThanOrEqual(102);
});
it("returns no solution when no sum fits and excludes zero credit", async () => {
  const result = await findSmartCombination([quota("zero", 0), quota("a", 30), quota("b", 30)], input);
  expect(result.items).toEqual([]); expect(result.summary).toBeNull(); expect(result.complete).toBe(true);
});
it("reports a bounded search as incomplete instead of claiming optimality or absence", async () => {
  const result = await findSmartCombination([quota("a", 45), quota("b", 55)], input, { maxNodes: 0 });
  expect(result.complete).toBe(false); expect(result.summary?.creditTotal).toBe(100);
});
it("accepts negative balances on creation and spreadsheet imports", () => {
  const row = { ...quota("1", 100), outstandingBalance: "-10,00" };
  expect(quotaInputSchema.parse(row).outstandingBalance).toBe(-10);
  expect(validateImportRows([row])[0].valid).toBe(true);
});
it("matches exhaustive enumeration on small varied stocks, including negative values", async () => {
  let seed = 42;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let round = 0; round < 20; round++) {
    const stock = Array.from({ length: 10 }, (_, i) => quota(String(i), 10 + Math.floor(random() * 80), Math.floor(random() * 30), Math.floor(random() * 10), Math.floor(random() * 90) - 40));
    for (const priority of ["entry", "installment", "balance"] as const) {
      const key = priority === "entry" ? "entryAmount" : priority === "installment" ? "installmentAmount" : "outstandingBalance";
      const combinations: { ratio: number; distance: number; count: number; cost: number }[] = [];
      for (let mask = 1; mask < 1 << stock.length; mask++) {
        const selected = stock.filter((_, i) => mask & (1 << i));
        const credit = selected.reduce((sum, q) => sum + Number(q.creditAmount), 0);
        if (credit < 98 || credit > 102) continue;
        const cost = selected.reduce((sum, q) => sum + Number(q[key]), 0);
        combinations.push({ ratio: cost / credit, distance: Math.abs(credit - 100), count: selected.length, cost });
      }
      combinations.sort((a, b) => a.ratio - b.ratio || a.distance - b.distance || a.count - b.count || Math.abs(a.cost) - Math.abs(b.cost));
      const result = await findSmartCombination(stock, { ...input, priority });
      expect(result.complete).toBe(true);
      if (!combinations.length) expect(result.items).toHaveLength(0);
      else {
        expect(result.summary!.criterionPercentage / 100).toBeCloseTo(combinations[0].ratio, 9);
        expect(Math.abs(result.summary!.creditTotal - 100)).toBe(combinations[0].distance);
        expect(result.items.length).toBe(combinations[0].count);
      }
    }
  }
});
