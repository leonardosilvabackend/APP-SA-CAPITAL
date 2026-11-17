import { expect, it } from 'vitest';
import { findSmartOptions } from './smart-options';
import type { CalculationQuota } from '../../shared/quote';
const input={administrator:'',category:'Auto',targetCredit:150000,priority:'entry' as const};
const stock: CalculationQuota[]=Array.from({length:1000},(_,i)=>({id:`q${i}`,code:`q${i}`,administrator:`Admin ${i%5}`,category:'Auto',creditAmount:10000+i*17,entryAmount:2000,installmentAmount:300,installmentCount:100,outstandingBalance:30000}));

it('returns an explicit partial response when its time budget is already exhausted',async()=>{
  const start=performance.now();const result=await findSmartOptions(stock,input,{maxMs:0});
  expect(performance.now()-start).toBeLessThan(1000);
  expect(result.complete).toBe(false);expect(result.options).toEqual([]);
});
it('retains valid alternatives at the deadline and releases capacity for the next search',async()=>{
  const start=performance.now();const result=await findSmartOptions(stock,input,{maxMs:4000});
  // The worker has a 4 s budget; allow process startup/scheduling overhead on CI.
  expect(performance.now()-start).toBeLessThan(5500);
  expect(result.complete).toBe(false);
  expect(result.options.length).toBeGreaterThan(0);
  expect(new Set(result.options.map(o=>o.items[0].administrator)).size).toBe(result.options.length);
  for(const option of result.options){
    expect(option.summary.creditTotal).toBeGreaterThanOrEqual(147000);
    expect(option.summary.creditTotal).toBeLessThanOrEqual(153000);
    expect(option.summary.entryTotal).toBe(option.items.length*2000);
    expect(new Set(option.items.map(q=>q.id)).size).toBe(option.items.length);
  }
  const next=await findSmartOptions([{...stock[0],creditAmount:150000}],input);
  expect(next.complete).toBe(true);expect(next.options).toHaveLength(1);
},12000);
it('never relaxes the installment budget to fabricate a partial option',async()=>{
  const result=await findSmartOptions(stock,{...input,secondaryAmount:1},{maxMs:50});
  for(const option of result.options)if(!result.fallback)expect(option.summary.installmentTotal).toBeLessThanOrEqual(1);
});
