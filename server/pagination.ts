import type { Request } from "express";

export function pagination(req: Request) {
  const number = (value: unknown, fallback: number, maximum: number) => {
    const n = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : fallback;
    return Number.isSafeInteger(n) && n >= 1 ? Math.min(n, maximum) : fallback;
  };
  const page = number(req.query.page, 1, 10000);
  const pageSize = number(req.query.pageSize, 20, 100);
  return { page, pageSize, offset: (page - 1) * pageSize };
}
export function pageResult<T>(rows: T[], paging: ReturnType<typeof pagination>) {
  return { items: rows.slice(0, paging.pageSize), page: paging.page, pageSize: paging.pageSize, hasNext: rows.length > paging.pageSize };
}
