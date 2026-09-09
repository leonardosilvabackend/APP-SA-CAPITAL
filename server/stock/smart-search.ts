import { setImmediate as yieldToServer } from "node:timers/promises";
import type { CalculationQuota } from "../../shared/quote";
import type { SmartSearchInput } from "../../shared/stock";

// Database decimals are converted to integer cents before summing/comparing.
export function moneyCents(value: string | number): bigint {
  const text = typeof value === "number" ? value.toFixed(2) : value;
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) throw new Error("Valor monetário inválido no estoque");
  return (BigInt(match[2]) * 100n + BigInt((match[3] ?? "").padEnd(2, "0"))) * (match[1] ? -1n : 1n);
}
const abs = (value: bigint) => value < 0n ? -value : value;
type Choice = { index: number; previous: Choice | null };
type State = { index: number; credit: bigint; cost: bigint; count: number; choice: Choice | null };
const ratioScale = 10_000_000_000n; // Ratios within 1e-10 are treated as a tie.

export async function findSmartCombination<T extends CalculationQuota>(
  stock: T[], input: SmartSearchInput,
  limits: { maxNodes?: number; maxMs?: number } = {},
) {
  const target = moneyCents(input.targetCredit);
  const minimum = (target * 98n + 99n) / 100n;
  const maximum = target * 102n / 100n;
  const key = input.priority === "entry" ? "entryAmount" : input.priority === "installment" ? "installmentAmount" : "outstandingBalance";
  const seen = new Set<string>();
  const candidates = stock.filter(item => {
    if (seen.has(item.id) || item.category !== input.category || (input.administrator && item.administrator !== input.administrator)) return false;
    seen.add(item.id);
    return true;
  }).map(item => ({ item, credit: moneyCents(item.creditAmount), cost: moneyCents(item[key]) }))
    .filter(item => item.credit > 0n && item.credit <= maximum)
    .sort((a, b) => {
      const cross = a.cost * b.credit - b.cost * a.credit;
      return cross < 0n ? -1 : cross > 0n ? 1 : a.item.code.localeCompare(b.item.code) || a.item.id.localeCompare(b.item.id);
    });
  const suffixCredit = new Array<bigint>(candidates.length + 1).fill(0n);
  for (let i = candidates.length - 1; i >= 0; i--) suffixCredit[i] = suffixCredit[i + 1] + candidates[i].credit;
  let best: State | null = null;
  function consider(state: State) {
    if (state.credit < minimum || state.credit > maximum || !state.count) return;
    if (best) {
      const cross = state.cost * best.credit - best.cost * state.credit;
      if (abs(cross) * ratioScale > state.credit * best.credit) {
        if (cross >= 0n) return;
      } else {
        const distance = abs(state.credit - target) - abs(best.credit - target);
        if (distance > 0n || (distance === 0n && (state.count > best.count || (state.count === best.count && abs(state.cost) >= abs(best.cost))))) return;
      }
    }
    best = state;
  }
  // Seed with singles and a ratio-ordered feasible combination, without privileging either.
  const greedyByAdministrator = new Map<string, State>();
  for (let index = 0; index < candidates.length; index++) {
    const candidate = candidates[index];
    let greedy = greedyByAdministrator.get(candidate.item.administrator) ?? { index: 0, credit: 0n, cost: 0n, count: 0, choice: null };
    consider({ index, credit: candidate.credit, cost: candidate.cost, count: 1, choice: { index, previous: null } });
    if (greedy.credit + candidate.credit <= maximum) {
      greedy = { index, credit: greedy.credit + candidate.credit, cost: greedy.cost + candidate.cost, count: greedy.count + 1, choice: { index, previous: greedy.choice } };
      greedyByAdministrator.set(candidate.item.administrator, greedy);
      consider(greedy);
    }
  }
  const stack: State[] = [{ index: 0, credit: 0n, cost: 0n, count: 0, choice: null }];
  const deadline = performance.now() + (limits.maxMs ?? 1500);
  const maxNodes = limits.maxNodes ?? 250_000;
  let visited = 0;
  while (stack.length && visited < maxNodes && performance.now() < deadline) {
    if (visited % 1024 === 0) await yieldToServer();
    visited++;
    const state = stack.pop()!;
    consider(state);
    if (state.index >= candidates.length || state.credit >= maximum || state.credit + suffixCredit[state.index] < minimum) continue;
    const candidate = candidates[state.index];
    // Each branch belongs to one administrator; All compares those branches.
    if (state.choice && candidates[state.choice.index].item.administrator !== candidate.item.administrator) {
      stack.push({ ...state, index: state.index + 1 });
      continue;
    }
    if (best) {
      // Fractional relaxation: all remaining credit at the lowest remaining ratio.
      // This optimistic bound works for negative costs too. Never prune near ties.
      const low = Number(state.credit < minimum ? minimum - state.credit : 0n);
      const high = Number(maximum - state.credit < suffixCredit[state.index] ? maximum - state.credit : suffixCredit[state.index]);
      const ratio = Number(candidate.cost) / Number(candidate.credit);
      const boundAt = (extra: number) => (Number(state.cost) + extra * ratio) / (Number(state.credit) + extra);
      const lowerBound = Math.min(state.credit ? boundAt(low) : ratio, boundAt(high));
      const incumbent = best as State;
      const bestRatio = Number(incumbent.cost) / Number(incumbent.credit);
      const numericSlack = 1e-10 + Number.EPSILON * 64 * Math.max(1, Math.abs(lowerBound), Math.abs(bestRatio));
      if (lowerBound > bestRatio + numericSlack) continue;
    }
    stack.push({ ...state, index: state.index + 1 });
    if (state.credit + candidate.credit <= maximum) stack.push({
      index: state.index + 1, credit: state.credit + candidate.credit, cost: state.cost + candidate.cost,
      count: state.count + 1, choice: { index: state.index, previous: state.choice },
    });
  }
  const selected: T[] = [];
  // Assignments inside consider are not tracked by TypeScript control flow.
  const winner = best as State | null;
  for (let choice = winner?.choice; choice; choice = choice.previous) selected.push(candidates[choice.index].item);
  selected.reverse();
  const sum = (field: "creditAmount" | "entryAmount" | "installmentAmount" | "outstandingBalance") => Number(selected.reduce((total, item) => total + moneyCents(item[field]), 0n)) / 100;
  const creditTotal = sum("creditAmount");
  return {
    items: selected, complete: stack.length === 0, priority: input.priority,
    summary: winner ? { creditTotal, entryTotal: sum("entryAmount"), installmentTotal: sum("installmentAmount"), balanceTotal: sum("outstandingBalance"), criterionPercentage: Number(winner.cost) / Number(winner.credit) * 100 } : null,
  };
}
