import { expect, it } from "vitest";
import type { CalculationQuota } from "../../shared/quote";
import type { SmartSearchInput } from "../../shared/stock";
import { findSmartOptions } from "./smart-options";

const q = (id: string, credit = 100000, entry = 20000, installment = 1000, balance = 80000, administrator = "A"): CalculationQuota => ({ id, code: id, category: "Imóvel", administrator, creditAmount: credit, entryAmount: entry, installmentAmount: installment, outstandingBalance: balance, installmentCount: 120 });
const input: SmartSearchInput = { category: "Imóvel", administrator: "", targetCredit: 100000, priority: "entry", secondaryAmount: 1500 };

it("uses the 0.10 percentage-point entry band to improve the second criterion within the maximum installment", async () => {
  const result = await findSmartOptions([q("minimum", 100000, 20000, 1400), q("within", 100000, 20100, 1000), q("outside", 100000, 20101, 900), q("over-budget", 100000, 19000, 1600)], input);
  expect(result.complete).toBe(true);
  expect(result.options.find(o => o.kind === "request")?.items[0].id).toBe("within");
  expect(result.options.find(o => o.kind === "primary")?.items[0].id).toBe("over-budget");
  expect(result.options.find(o => o.kind === "primary")?.matchesRequest).toBe(false);
  expect(result.options.find(o => o.kind === "secondary")?.items[0].id).toBe("outside");
});
it.each(["installment", "balance"] as const)("respects inclusive ±5%% suggested entry for %s", async priority => {
  const result = await findSmartOptions([q("low", 100000, 19000, 1000, 60000), q("high", 100000, 21000, 800, 50000), q("out", 100000, 21000.01, 100, -1000)], { ...input, priority, secondaryAmount: 20000 });
  expect(result.options.find(o => o.kind === "request")?.items[0].id).toBe("high");
  expect(result.options.find(o => o.kind === "primary")?.items[0].id).toBe("out");
  expect(result.options.find(o => o.kind === "secondary")?.items[0].id).toBe("low");
});
it("does not silently relax an impossible budget and reports partial searches", async () => {
  const stock = [q("only")];
  const impossible = await findSmartOptions(stock, { ...input, secondaryAmount: 0 });
  expect(impossible.options.some(o => o.kind === "request")).toBe(false);
  expect(impossible.complete).toBe(true);
  const partial = await findSmartOptions(stock, input, { maxNodes: 0 });
  expect(partial.complete).toBe(false);
});
it("keeps administrators and category separate and never reuses a quota", async () => {
  const stock = [q("a", 40000, 10000), q("b", 60000, 10000, 1000, 80000, "B"), { ...q("vehicle"), category: "Veículo" }];
  expect((await findSmartOptions(stock, input)).options).toEqual([]);
  const same = [q("a", 40000, 10000, 500), q("b", 60000, 10000, 500)];
  const result = await findSmartOptions([...same, same[0]], input);
  expect(result.items.map(i => i.id).sort()).toEqual(["a", "b"]);
});
it.each(["entry","installment","balance"] as const)("returns all three optima with optional budget omitted and %s first",async priority=>{
 const stock=[q("entry",100000,10000,4000,120000),q("installment",100000,30000,500,110000),q("balance",100000,20000,1000,80000)];
 const result=await findSmartOptions(stock,{...input,priority,secondaryAmount:undefined});
 expect(result.complete).toBe(true);expect(result.options[0].kind).toBe(priority);
 expect(result.options).toHaveLength(3);
 for(const metric of ["entry","installment","balance"] as const)expect(result.options.find(o=>o.kind===metric)?.items[0].id).toBe(metric);
});
it("matches exhaustive enumeration for all three objectives on varied small stocks", async () => {
  let seed = 2026; const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let round = 0; round < 25; round++) {
    const stock = Array.from({ length: 9 }, (_, i) => q(String(i), 10000 + Math.floor(random() * 80000), Math.floor(random() * 25000), Math.floor(random() * 1500), Math.floor(random() * 90000) - 20000, i % 3 ? "A" : "B"));
    const sums: { credit: number; entry: number; installment: number; balance: number; count: number }[] = [];
    for (let mask = 1; mask < 1 << stock.length; mask++) {
      const selected = stock.filter((_, i) => mask & (1 << i));
      if (new Set(selected.map(i => i.administrator)).size !== 1) continue;
      const sum = (field: "creditAmount" | "entryAmount" | "installmentAmount" | "outstandingBalance") => selected.reduce((total, item) => total + Number(item[field]), 0);
      const credit = sum("creditAmount"); if (credit < 98000 || credit > 102000) continue;
      sums.push({ credit, entry: sum("entryAmount"), installment: sum("installmentAmount"), balance: sum("outstandingBalance"), count: selected.length });
    }
    for (const priority of ["entry", "installment", "balance"] as const) for (const omitBudget of [false,true]) {
      const budget = priority === "entry" ? 2200 : 30000;
      const result = await findSmartOptions(stock, { ...input, priority, secondaryAmount: omitBudget ? undefined : budget });
      expect(result.complete).toBe(true);
      const secondary = priority === "entry" ? "installment" : "entry";
      const order = (metric: typeof priority) => (a: typeof sums[number], b: typeof sums[number]) => (metric === "balance" ? a.balance - b.balance : a[metric] / a.credit - b[metric] / b.credit) || Math.abs(a.credit - 100000) - Math.abs(b.credit - 100000) || a.count - b.count || Math.abs(a[metric]) - Math.abs(b[metric]);
      let feasible = omitBudget ? sums : sums.filter(s => priority === "entry" ? s.installment <= budget : s.entry >= budget * .95 && s.entry <= budget * 1.05);
      if (!omitBudget && priority === "entry" && feasible.length) { const min = Math.min(...feasible.map(s => s.entry / s.credit)); feasible = feasible.filter(s => s.entry / s.credit <= min + .001 + 1e-12); }
      const checks = omitBudget ? (["entry","installment","balance"] as const).map(metric=>[metric,sums,metric] as const) : [["primary", sums, priority], ["secondary", sums, secondary], ["request", feasible, priority === "entry" ? secondary : priority]] as const;
      for (const [kind, candidates, metric] of checks) {
        const expected = [...candidates].sort(order(metric))[0]; const actual = result.options.find(o => o.kind === kind);
        if (!expected) expect(actual).toBeUndefined();
        else { const summary = actual!.summary; const cost = metric === "entry" ? summary.entryTotal : metric === "installment" ? summary.installmentTotal : summary.balanceTotal; if(metric === "balance") expect(cost).toBe(expected.balance); else expect(cost / summary.creditTotal).toBeCloseTo(expected[metric] / expected.credit, 10); expect(Math.abs(summary.creditTotal - 100000)).toBe(Math.abs(expected.credit - 100000)); }
      }
    }
  }
});

it.each([undefined,20000])("minimizes balance in reais instead of its credit ratio with budget %s",async secondaryAmount=>{
 const result=await findSmartOptions([q("lower-reais",98000,20000,1000,79000),q("lower-ratio",102000,20000,1000,81000)],{...input,priority:"balance",secondaryAmount});
 expect(result.complete).toBe(true);expect(result.items[0].id).toBe("lower-reais");
});
