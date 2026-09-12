export type QuotaRecord = { id: string; code: string; category: string; administrator: string; supplier: string | null; creditAmount: string; entryAmount: string; installmentCount: number; installmentAmount: string; outstandingBalance: string; status: "available" | "reserved" | "sold"; featured: boolean };
export type StockResponse = { items: QuotaRecord[]; page: number; pageSize: number; total: number; totalPages: number };
export type StockFilters = { categories: string[]; administrators: string[] };
export type Opportunity = { id: string; reason: string; quotas: QuotaRecord[]; summary: { creditTotal: number; finalEntryTotal: number } };
export type PreviewRow = { row: number; valid: boolean; error?: string; data?: unknown };
export async function stockApi(path = "", options?: RequestInit) { const response = await fetch(`/api/stock${path}`, { credentials: "same-origin", ...options, headers: options?.body ? { "Content-Type": "application/json", ...options.headers } : options?.headers }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error ?? "Não foi possível concluir a operação"); return data; }
export function stockCurrency(value: string | number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value)); }
