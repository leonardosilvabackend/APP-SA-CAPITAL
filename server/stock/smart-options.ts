import { setImmediate as yieldToServer } from "node:timers/promises";
import type { CalculationQuota } from "../../shared/quote";
import type { SmartSearchInput } from "../../shared/stock";
import type { SmartResult, SmartOptionKind } from "../../shared/smart-result";
import { moneyCents, moneyNumber } from "../../shared/money";

type Metric = "entry" | "installment" | "balance";
type Choice = { index: number; previous: Choice | null };
type State = { index: number; credit: bigint; entry: bigint; installment: bigint; balance: bigint; count: number; choice: Choice | null };
const absolute = (n: bigint) => n < 0n ? -n : n;
const compareRatio = (a: State, b: State, key: Metric) => a[key] * b.credit - b[key] * a.credit;
const compareMetric = (a: State, b: State, key: Metric) => key === "balance" ? a.balance - b.balance : compareRatio(a, b, key);
const metricValue = (s: State, key: Metric) => key === "balance" ? Number(s.balance) : Number(s[key]) / Number(s.credit);

/** One bounded traversal retains the primary, secondary and budget-constrained optima.
 * The entry request retains a Pareto frontier because a newly found lower entry
 * percentage can invalidate an earlier candidate's 0.10 percentage-point band. */
export async function findSmartOptions<T extends CalculationQuota>(stock: T[], input: SmartSearchInput, limits: { maxNodes?: number; maxMs?: number } = {}): Promise<SmartResult<T>> {
  const started = performance.now();
  const target = moneyCents(input.targetCredit), minimum = (target * 98n + 99n) / 100n, maximum = target * 102n / 100n;
  const budget = input.secondaryAmount === undefined ? null : moneyCents(input.secondaryAmount);
  const entryMin = budget === null ? 0n : (budget * 95n + 99n) / 100n;
  const entryMax = budget === null ? 0n : budget * 105n / 100n;
  const secondary: Metric = input.priority === "entry" ? "installment" : "entry";
  const thirdMetric: Metric = input.priority === "balance" ? "installment" : "balance";
  const seen = new Set<string>();
  const candidates = stock.filter(item => {
    if (seen.has(item.id) || item.category !== input.category || (input.administrator && item.administrator !== input.administrator)) return false;
    seen.add(item.id); return true;
  }).map(item => ({ item, credit: moneyCents(item.creditAmount), entry: moneyCents(item.entryAmount), installment: moneyCents(item.installmentAmount), balance: moneyCents(item.outstandingBalance) }))
    .filter(item => item.credit > 0n && item.credit <= maximum)
    .sort((a, b) => { const cross = a[input.priority] * b.credit - b[input.priority] * a.credit; return cross < 0n ? -1 : cross > 0n ? 1 : a.item.code.localeCompare(b.item.code) || a.item.id.localeCompare(b.item.id); });
  const suffixCredit = new Array<bigint>(candidates.length + 1).fill(0n);
  const suffixEntry = new Array<bigint>(candidates.length + 1).fill(0n);
  const ratios: Record<Metric, number[]> = { entry: [], installment: [], balance: [] };
  for (const metric of Object.keys(ratios) as Metric[]) {
    ratios[metric][candidates.length] = Infinity;
    for (let i = candidates.length - 1; i >= 0; i--) ratios[metric][i] = Math.min(ratios[metric][i + 1], Number(candidates[i][metric]) / Number(candidates[i].credit));
  }
  for (let i = candidates.length - 1; i >= 0; i--) { suffixCredit[i] = suffixCredit[i + 1] + candidates[i].credit; suffixEntry[i] = suffixEntry[i + 1] + candidates[i].entry; }
  let primary: State | null = null, second: State | null = null, request: State | null = null, third: State | null = null;
  let frontier: State[] = [];
  const tie = (a: State, b: State, metric: Metric) => absolute(a.credit - target) < absolute(b.credit - target)
    || (absolute(a.credit - target) === absolute(b.credit - target) && (a.count < b.count || (a.count === b.count && absolute(a[metric]) < absolute(b[metric]))));
  const better = (a: State, b: State | null, metric: Metric) => !b || compareMetric(a, b, metric) < 0n || (compareMetric(a, b, metric) === 0n && tie(a, b, metric));
  const matchesBudget = (s: State) => budget === null || (input.priority === "entry" ? s.installment <= budget : s.entry >= entryMin && s.entry <= entryMax);
  function consider(s: State) {
    if (!s.count || s.credit < minimum || s.credit > maximum) return;
    if (better(s, primary, input.priority)) primary = s;
    if (better(s, second, secondary)) second = s;
    if (budget === null && better(s, third, thirdMetric)) third = s;
    if (!matchesBudget(s)) return;
    if (budget === null) { if (better(s, request, input.priority)) request = s; return; }
    if (input.priority !== "entry") { if (better(s, request, input.priority)) request = s; return; }
    // Do not discard a candidate based on the current band: the lower-entry
    // frontier is needed until the traversal has ended.
    const dominates = (a: State, b: State) => compareRatio(a, b, "entry") <= 0n && compareRatio(a, b, "installment") <= 0n
      && (compareRatio(a, b, "installment") < 0n || !tie(b, a, "installment"));
    if (frontier.some(other => dominates(other, s))) return;
    frontier = frontier.filter(other => !dominates(s, other)); frontier.push(s);
  }
  const empty: State = { index: 0, credit: 0n, entry: 0n, installment: 0n, balance: 0n, count: 0, choice: null };
  const add = (s: State, index: number): State => ({ index: index + 1, credit: s.credit + candidates[index].credit, entry: s.entry + candidates[index].entry, installment: s.installment + candidates[index].installment, balance: s.balance + candidates[index].balance, count: s.count + 1, choice: { index, previous: s.choice } });
  // Establish useful incumbents for each objective, without mixing administrators.
  for (const metric of new Set<Metric>(budget === null ? [input.priority, secondary, thirdMetric] : [input.priority, secondary])) {
    const indices = candidates.map((_, i) => i).sort((a, b) => { const cross = candidates[a][metric] * candidates[b].credit - candidates[b][metric] * candidates[a].credit; return cross < 0n ? -1 : cross > 0n ? 1 : a - b; });
    const greedy = new Map<string, State>();
    for (let position = 0; position < indices.length; position++) {
      if (position % 1024 === 0) await yieldToServer();
      if (performance.now() >= started + (limits.maxMs ?? 1500)) break;
      const i = indices[position]; consider(add(empty, i)); const previous = greedy.get(candidates[i].item.administrator) ?? empty;
      if (previous.credit + candidates[i].credit <= maximum) { const next = add(previous, i); greedy.set(candidates[i].item.administrator, next); consider(next); }
    }
  }
  const stack: State[] = [empty]; let visited = 0;
  const deadline = started + (limits.maxMs ?? 1500), maxNodes = limits.maxNodes ?? 250_000;
  function lowerBound(s: State, metric: Metric) {
    const low = Number(s.credit < minimum ? minimum - s.credit : 0n), high = Number(maximum - s.credit < suffixCredit[s.index] ? maximum - s.credit : suffixCredit[s.index]);
    const ratio = ratios[metric][s.index];
    const at = (extra: number) => metric === "balance" ? Number(s.balance) + extra * ratio : (Number(s[metric]) + extra * ratio) / (Number(s.credit) + extra);
    if (metric === "balance") return Math.min(at(low), at(high));
    return Math.min(s.credit ? at(low) : ratio, at(high));
  }
  const safelyAbove = (bound: number, value: number) => bound > value + 1e-10 + Number.EPSILON * 64 * Math.max(1, Math.abs(bound), Math.abs(value));
  while (stack.length && visited < maxNodes && performance.now() < deadline) {
    if (visited % 1024 === 0) await yieldToServer(); visited++;
    const s = stack.pop()!; consider(s);
    if (s.index >= candidates.length || s.credit >= maximum || s.credit + suffixCredit[s.index] < minimum) continue;
    const c = candidates[s.index];
    if (s.choice && candidates[s.choice.index].item.administrator !== c.item.administrator) { stack.push({ ...s, index: s.index + 1 }); continue; }
    const incumbentPrimary = primary as State | null, incumbentSecond = second as State | null, incumbentRequest = request as State | null;
    if (incumbentPrimary && incumbentSecond) {
      const firstBound = lowerBound(s, input.priority), secondBound = lowerBound(s, secondary);
      const primaryCannotImprove = safelyAbove(firstBound, metricValue(incumbentPrimary, input.priority));
      const secondaryCannotImprove = safelyAbove(secondBound, metricValue(incumbentSecond, secondary));
      let requestCannotImprove = budget !== null && (input.priority === "entry" ? s.installment > budget : s.entry > entryMax || s.entry + suffixEntry[s.index] < entryMin);
      if (!requestCannotImprove && (input.priority !== "entry" || budget === null) && incumbentRequest) requestCannotImprove = safelyAbove(firstBound, metricValue(incumbentRequest, input.priority));
      if (!requestCannotImprove && input.priority === "entry") requestCannotImprove = frontier.some(f => safelyAbove(firstBound, Number(f.entry) / Number(f.credit)) && safelyAbove(secondBound, Number(f.installment) / Number(f.credit)));
      const incumbentThird = third as State | null;
      const thirdCannotImprove = budget !== null || (incumbentThird && safelyAbove(lowerBound(s, thirdMetric), metricValue(incumbentThird, thirdMetric)));
      if (primaryCannotImprove && secondaryCannotImprove && requestCannotImprove && thirdCannotImprove) continue;
    }
    stack.push({ ...s, index: s.index + 1 });
    if (s.credit + c.credit <= maximum) stack.push(add(s, s.index));
  }
  if (input.priority === "entry" && budget !== null && frontier.length) {
    const lowest = frontier.reduce((a, b) => better(a, b, "entry") ? a : b);
    for (const f of frontier) if ((f.entry * lowest.credit - lowest.entry * f.credit) * 1000n <= f.credit * lowest.credit && better(f, request, "installment")) request = f;
  }
  function option(s: State, kind: SmartOptionKind, criterion: Metric = input.priority) {
    const items: T[] = []; for (let choice = s.choice; choice; choice = choice.previous) items.push(candidates[choice.index].item); items.reverse();
    return { kind, criterion, items, matchesRequest: matchesBudget(s), summary: { creditTotal: moneyNumber(s.credit), entryTotal: moneyNumber(s.entry), installmentTotal: moneyNumber(s.installment), balanceTotal: moneyNumber(s.balance), criterionPercentage: Number(s[criterion]) / Number(s.credit) * 100 } };
  }
  const choices: [SmartOptionKind, State | null, Metric][] = budget === null ? [[input.priority, primary, input.priority], [secondary, second, secondary], [thirdMetric, third, thirdMetric]] : [["request", request, input.priority], ["primary", primary, input.priority], ["secondary", second, secondary]];
  const options = choices.flatMap(([kind, s, metric]) => s ? [option(s, kind, metric)] : []);
  const main = options[0];
  return { items: main?.items ?? [], summary: main?.summary ?? null, complete: stack.length === 0, priority: input.priority, options };
}
