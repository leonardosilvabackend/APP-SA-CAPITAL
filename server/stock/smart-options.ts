import { Worker } from "node:worker_threads";
import type { CalculationQuota } from "../../shared/quote";
import type { SmartSearchInput } from "../../shared/stock";
import type { SmartResult, SmartOption } from "../../shared/smart-result";
import { moneyCents, moneyNumber } from "../../shared/money";
import { administratorKey } from "../../shared/administrator-name";

type Amounts = { credit: bigint; entry: bigint; installment: bigint; balance: bigint };
type Bucket<T> = Amounts & { items: T[] };
type Solved = { group: number; counts: number[] };
type Reply = { winners: Solved[]; fallback: boolean; complete?: boolean; progress?: boolean };
type Job = { payload: unknown; deadline: number; progress: (value: Reply) => void; resolve: (value: Reply) => void; reject: (error: Error) => void; timer?: ReturnType<typeof setTimeout> };
type Slot = { worker: Worker; job: Job | null };
const slots: Slot[] = [], queue: Job[] = [];

function dispatch() {
  while (queue.length) {
    if (queue[0].deadline <= Date.now()) { queue.shift()!.resolve({winners:[],fallback:false,complete:false}); continue; }
    let slot = slots.find(value => !value.job);
    if (!slot && slots.length < 2) {
      const worker = new Worker(new URL("./smart-solver-worker.mjs", import.meta.url), { execArgv: [] });
      slot = { worker, job: null };
      const current = slot;
      const failed = (error: Error) => {
        const index = slots.indexOf(current);
        if (index < 0) return;
        slots.splice(index, 1);
        const job = current.job; current.job = null;
        clearTimeout(job?.timer);
        job?.reject(error);
        void worker.terminate(); dispatch();
      };
      worker.on("message", (message: Reply & { error?: string }) => {
        if (message.progress) { current.job?.progress(message); return; }
        const job = current.job; current.job = null; worker.unref();
        clearTimeout(job?.timer);
        if (message.error) job?.reject(new Error(message.error)); else job?.resolve(message);
        dispatch();
      });
      worker.on("error", failed);
      worker.on("exit", () => failed(new Error("O processamento da busca foi interrompido. Tente novamente.")));
      slots.push(slot);
    }
    if (!slot) return;
    slot.job = queue.shift()!;
    const current = slot, job = slot.job;
    job.timer = setTimeout(() => {
      const index = slots.indexOf(current);
      if (index < 0 || current.job !== job) return;
      slots.splice(index,1); current.job=null;
      void current.worker.terminate();
      job.resolve({winners:[],fallback:false,complete:false}); dispatch();
    }, Math.max(0,job.deadline-Date.now()));
    slot.worker.ref(); slot.worker.postMessage(slot.job.payload);
  }
}

/** One shared deadline includes worker startup, queueing and fallback. */
export async function findSmartOptions<T extends CalculationQuota>(stock: T[], input: SmartSearchInput, limits: { maxMs?: number } = {}): Promise<SmartResult<T>> {
  const deadline = Date.now() + Math.min(15_000, Math.max(0, limits.maxMs ?? 15_000));
  let complete = true;
  const target = moneyCents(input.targetCredit), minimum = (target * 98n + 99n) / 100n, maximum = target * 102n / 100n;
  const budget = input.priority === "entry" && input.secondaryAmount !== undefined ? moneyCents(input.secondaryAmount) : null;
  const grouped = new Map<string, Map<string, Bucket<T>>>(), seen = new Set<string>();
  for (const item of stock) {
    if (seen.has(item.id) || item.category !== input.category || (input.administrator && item.administrator !== input.administrator)) continue;
    seen.add(item.id);
    const amounts = { credit: moneyCents(item.creditAmount), entry: moneyCents(item.entryAmount), installment: moneyCents(item.installmentAmount), balance: moneyCents(item.outstandingBalance) };
    if (amounts.credit <= 0n || amounts.credit > maximum) continue;
    const key = administratorKey(item.administrator);
    let group = grouped.get(key);
    if (!group) { group = new Map(); grouped.set(key, group); }
    const financialKey = Object.values(amounts).join("/");
    const bucket = group.get(financialKey);
    if (bucket) bucket.items.push(item); else group.set(financialKey, { ...amounts, items: [item] });
  }
  const groups = [...grouped.values()].map(group => [...group.values()]);
  const serialized = groups.map(group => group.map(({ items, ...amounts }) => ({ ...amounts, count: items.length })));
  const unfinished = new Set<number>();
  const retained = new Map<number, {winner:Solved;amounts:Amounts}>();
  let batchSize = serialized.length;
  const runGroup = (group: typeof serialized[number], groupIndex: number, fallbackMode = false) => new Promise<Solved | null>((resolve, reject) => {
    let best: Solved | null = retained.get(groupIndex)?.winner ?? null;
    let bestAmounts: Amounts | null = retained.get(groupIndex)?.amounts ?? null;
    const accept = (reply: Reply) => {
      const candidate = reply.winners[0]; if (!candidate || candidate.counts.length !== group.length) return;
      const amounts: Amounts = {credit:0n,entry:0n,installment:0n,balance:0n};
      for (let i=0;i<group.length;i++) {
        const n=candidate.counts[i]; if (!Number.isInteger(n) || n<0 || n>group[i].count) return;
        for (const field of ['credit','entry','installment','balance'] as const) amounts[field]+=group[i][field]*BigInt(n);
      }
      if (amounts.credit<minimum || amounts.credit>maximum || (!fallbackMode && budget!==null && amounts.installment>budget)) return;
      const abs=(v:bigint)=>v<0n?-v:v;
      const previous=bestAmounts;
      const comparison=previous ? ((fallbackMode ? amounts.installment-previous.installment : 0n)
        || (input.priority==='balance' ? (amounts.balance-amounts.credit)-(previous.balance-previous.credit) : amounts[input.priority]*previous.credit-previous[input.priority]*amounts.credit)
        || abs(amounts.credit-target)-abs(previous.credit-target) || amounts[input.priority]-previous[input.priority]) : -1n;
      if (comparison<0n) { best={...candidate,group:groupIndex};bestAmounts=amounts;retained.set(groupIndex,{winner:best,amounts}); }
    };
    queue.push({ deadline, progress:accept, reject, resolve: reply => {accept(reply);if(reply.complete===false)unfinished.add(groupIndex);else unfinished.delete(groupIndex);resolve(best);}, payload: { groups:[group],target,minimum,maximum,budget,priority:input.priority,forceFallback:fallbackMode,deadline,groupBudgetMs:Math.max(1,(deadline-Date.now())/Math.max(1,Math.ceil(batchSize/2))) } }); dispatch();
  });
  const finishRemaining = async (fallbackMode=false) => {
    while(unfinished.size && deadline-Date.now()>25) {
      const indices=[...unfinished];batchSize=indices.length;
      await Promise.all(indices.map(index=>runGroup(serialized[index],index,fallbackMode)));
    }
    complete=unfinished.size===0;
    return [...retained.values()].map(value=>value.winner);
  };
  let fallback=false;
  let solved = (await Promise.all(serialized.map((group,index)=>runGroup(group,index)))).filter((value):value is Solved=>Boolean(value));
  solved=await finishRemaining();
  if (budget !== null && !solved.length && complete && Date.now()<deadline) {
    // A null budget invokes the worker's unrestricted optimization. Marking
    // fallback here preserves the global rule across every administrator.
    fallback=true;
    solved=(await Promise.all(serialized.map((group,index)=>runGroup(group,index,true)))).filter((value):value is Solved=>Boolean(value));
    solved=await finishRemaining(true);
  }
  const reply: Reply = { winners:solved,fallback };
  const totals = (items: T[]) => items.reduce((sum, item) => ({ credit: sum.credit + moneyCents(item.creditAmount), entry: sum.entry + moneyCents(item.entryAmount), installment: sum.installment + moneyCents(item.installmentAmount), balance: sum.balance + moneyCents(item.outstandingBalance) }), { credit:0n,entry:0n,installment:0n,balance:0n });
  const winners = reply.winners.map(winner => { const items = groups[winner.group].flatMap((bucket,index) => bucket.items.slice(0,winner.counts[index])); return { items, ...totals(items) }; });
  const abs = (value: bigint) => value < 0n ? -value : value;
  const sign = (value: bigint) => value < 0n ? -1 : value > 0n ? 1 : 0;
  winners.sort((a,b) => (reply.fallback ? sign(a.installment-b.installment) : 0)
    || sign(input.priority === "balance" ? (a.balance-a.credit)-(b.balance-b.credit) : a[input.priority]*b.credit-b[input.priority]*a.credit)
    || sign(abs(a.credit-target)-abs(b.credit-target)) || sign(a[input.priority]-b[input.priority]));
  const options: SmartOption<T>[] = winners.slice(0,3).map(state => ({ kind: budget === null ? "primary" : "request", criterion:input.priority, items:state.items, matchesRequest:budget === null || state.installment <= budget,
    summary: { creditTotal:moneyNumber(state.credit),entryTotal:moneyNumber(state.entry),installmentTotal:moneyNumber(state.installment),balanceTotal:moneyNumber(state.balance),balanceDifference:moneyNumber(state.balance-state.credit),criterionPercentage:input.priority === "balance" ? 0 : Number(state[input.priority])/Number(state.credit)*100 } }));
  return { items:options[0]?.items ?? [],summary:options[0]?.summary ?? null,complete,priority:input.priority,options,fallback:reply.fallback };
}
