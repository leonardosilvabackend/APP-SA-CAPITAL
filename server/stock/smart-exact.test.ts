import { expect, it } from "vitest";
import type { CalculationQuota } from "../../shared/quote";
import type { SmartSearchInput } from "../../shared/stock";
import { findSmartOptions } from "./smart-options";

// Independent exhaustive oracle: enumerate every subset, with no search pruning.
type Total = { administrator: string; credit: number; entry: number; installment: number; balance: number };
function exhaustive(stock: CalculationQuota[], input: SmartSearchInput) {
  const valid: Total[] = [];
  for (const administrator of new Set(stock.map(q => q.administrator))) {
    const group = stock.filter(q => q.administrator === administrator);
    for (let mask = 1; mask < 2 ** group.length; mask++) {
      const total = { administrator, credit:0, entry:0, installment:0, balance:0 };
      group.forEach((q,i) => { if (mask & 2 ** i) { total.credit += Number(q.creditAmount); total.entry += Number(q.entryAmount); total.installment += Number(q.installmentAmount); total.balance += Number(q.outstandingBalance); } });
      if (total.credit * 100 >= input.targetCredit * 98 && total.credit * 100 <= input.targetCredit * 102) valid.push(total);
    }
  }
  const budget = input.priority === "entry" ? input.secondaryAmount : undefined;
  const matching = valid.filter(t => budget === undefined || t.installment <= budget);
  const fallback = valid.length > 0 && matching.length === 0;
  const ranked = (fallback ? valid : matching).sort((a,b) => {
    const primary = input.priority === "balance" ? (a.balance-a.credit)-(b.balance-b.credit) : a[input.priority]*b.credit-b[input.priority]*a.credit;
    return (fallback ? a.installment-b.installment : 0) || primary || Math.abs(a.credit-input.targetCredit)-Math.abs(b.credit-input.targetCredit) || a[input.priority]-b[input.priority];
  });
  const seen = new Set<string>();
  return { fallback, options: ranked.filter(t => { if(seen.has(t.administrator)) return false; seen.add(t.administrator); return true; }).slice(0,3) };
}

it.each(["entry", "installment", "balance", "budget", "fallback"].flatMap(mode => Array.from({length:24}, (_, sample) => ({mode, sample}))))("equals exhaustive search for $mode sample $sample", async ({mode, sample: requestedSample}) => {
  let seed = 4721;
  const random = (n:number) => { seed = (Math.imul(seed,1664525)+1013904223) >>> 0; return Math.floor(seed / 4294967296 * n); };
  for(let sample=0;sample<24;sample++) {
    const stock: CalculationQuota[] = [];
    for(const administrator of ["A","B","C","D"]) for(let i=0;i<9;i++) {
      stock.push({id:`${administrator}${i}`,code:`${administrator}${i}`,administrator,category:"Imóvel",creditAmount:5000+random(35001),entryAmount:random(20)*500,installmentAmount:random(20)*20,outstandingBalance:random(40)*1000,installmentCount:120});
    }
    const input: SmartSearchInput = { administrator:"",category:"Imóvel",targetCredit:100000,priority:mode==="budget"||mode==="fallback"?"entry":mode as SmartSearchInput["priority"], ...(mode==="budget"?{secondaryAmount:500}:mode==="fallback"?{secondaryAmount:0}:{}) };
    if (sample !== requestedSample) continue;
    const expected = exhaustive(stock,input), actual = await findSmartOptions(stock,input);
    expect(actual.complete).toBe(true); expect(actual.fallback).toBe(expected.fallback);
    // Unused financial fields may differ between equally optimal subsets.
    // Compare every ranking/tie-break field, then verify all displayed totals.
    const ranking = (total: Total) => ({ administrator: total.administrator, credit:total.credit, value:total[input.priority], ...(expected.fallback ? { installment:total.installment } : {}) });
    expect(actual.options.map(o=>ranking({administrator:o.items[0].administrator,credit:o.summary.creditTotal,entry:o.summary.entryTotal,installment:o.summary.installmentTotal,balance:o.summary.balanceTotal}))).toEqual(expected.options.map(ranking));
    for(const option of actual.options) {
      expect(option.summary.creditTotal).toBe(option.items.reduce((sum,q)=>sum+Number(q.creditAmount),0));
      expect(option.summary.entryTotal).toBe(option.items.reduce((sum,q)=>sum+Number(q.entryAmount),0));
      expect(option.summary.installmentTotal).toBe(option.items.reduce((sum,q)=>sum+Number(q.installmentAmount),0));
      expect(option.summary.balanceTotal).toBe(option.items.reduce((sum,q)=>sum+Number(q.outstandingBalance),0));
      expect(new Set(option.items.map(q=>q.id)).size).toBe(option.items.length);
      expect(new Set(option.items.map(q=>q.administrator)).size).toBe(1);
    }
  }
});
