import type { CalculationQuota } from "../../shared/quote";

export type CurrentQuotaState = { id: string; code: string; status: string; committed: unknown };
export type QuoteQuotaAvailability = { id: string; code: string; status: "available" | "reserved" | "sold" | "unavailable" };

export function quoteQuotaAvailability(selected: CalculationQuota[], stock: CurrentQuotaState[]): QuoteQuotaAvailability[] {
  return selected.map(quota => {
    const current = stock.find(row => row.id === quota.id) ?? stock.find(row => row.code === quota.code);
    if (!current || current.id !== quota.id) return { id: quota.id, code: quota.code, status: "unavailable" };
    if (current.status === "sold") return { id: quota.id, code: quota.code, status: "sold" };
    if (current.status === "reserved" || Boolean(current.committed)) return { id: quota.id, code: quota.code, status: "reserved" };
    return { id: quota.id, code: quota.code, status: "available" };
  });
}
