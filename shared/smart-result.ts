import type { CalculationQuota } from "./quote";
import type { SmartSearchInput } from "./stock";

export type SmartSummary = { creditTotal: number; entryTotal: number; installmentTotal: number; balanceTotal: number; criterionPercentage: number };
export type SmartOptionKind = "request" | "primary" | "secondary" | "entry" | "installment" | "balance";
export type SmartOption<T = CalculationQuota> = { kind: SmartOptionKind; criterion?: SmartSearchInput["priority"]; items: T[]; summary: SmartSummary; matchesRequest: boolean };
export type SmartResult<T = CalculationQuota> = { items: T[]; summary: SmartSummary | null; complete: boolean; priority: SmartSearchInput["priority"]; options: SmartOption<T>[] };
