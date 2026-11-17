export type AlertCriteria = { administrator?: string | null; category?: string | null; desiredCredit?: number | string | null; maxEntryPercent?: number | string | null; maxInstallment?: number | string | null; averageTerm?: number | null; minOutstandingBalance?: number | string | null; maxOutstandingBalance?: number | string | null; outstandingBalanceRelation?: "below_credit" | "above_credit" | null };
export type AlertQuota = { administrator: string; category: string; creditAmount: number | string; entryAmount: number | string; installmentCount: number; installmentAmount?: number | string; outstandingBalance: number | string; status: string };

export function hasAlertCriteria(value: AlertCriteria) {
  return [value.administrator, value.category, value.desiredCredit, value.maxEntryPercent, value.maxInstallment, value.averageTerm, value.minOutstandingBalance, value.maxOutstandingBalance, value.outstandingBalanceRelation].some(v => v !== null && v !== undefined && v !== "");
}
export function matchesStockAlert(criteria: AlertCriteria, quota: AlertQuota) {
  if (quota.status !== "available" || !hasAlertCriteria(criteria)) return false;
  if (criteria.administrator && criteria.administrator !== quota.administrator) return false;
  if (criteria.category && criteria.category !== quota.category) return false;
  if (criteria.desiredCredit != null && Math.abs(Number(quota.creditAmount) - Number(criteria.desiredCredit)) > Number(criteria.desiredCredit) * 0.02) return false;
  if (criteria.maxEntryPercent != null && Number(quota.entryAmount) / Number(quota.creditAmount) * 100 > Number(criteria.maxEntryPercent)) return false;
  if (criteria.maxInstallment != null && Number(quota.installmentAmount) > Number(criteria.maxInstallment)) return false;
  if (criteria.averageTerm != null && (quota.installmentCount < criteria.averageTerm - 10 || quota.installmentCount > criteria.averageTerm + 10)) return false;
  if (criteria.minOutstandingBalance != null && Number(quota.outstandingBalance) < Number(criteria.minOutstandingBalance)) return false;
  if (criteria.maxOutstandingBalance != null && Number(quota.outstandingBalance) > Number(criteria.maxOutstandingBalance)) return false;
  if (criteria.outstandingBalanceRelation === "below_credit" && Number(quota.outstandingBalance) >= Number(quota.creditAmount)) return false;
  if (criteria.outstandingBalanceRelation === "above_credit" && Number(quota.outstandingBalance) <= Number(quota.creditAmount)) return false;
  return true;
}
export function matchNotificationText(count: number) { return count > 3 ? "+3 cotas dentro do seu gosto no estoque!" : `${count} ${count === 1 ? "cota está" : "cotas estão"} dentro do seu gosto no estoque!`; }
