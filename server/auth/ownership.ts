import { eq, or, sql, type AnyColumn } from "drizzle-orm";
import { users } from "../db/schema";

// A subquery works for SELECT, UPDATE and DELETE; no outer users join is required.
export function ownershipScope(owner: AnyColumn, user: { id: string; role: string }, administrative = false) {
  if (user.role === "admin" || administrative && user.role === "administrative") return undefined;
  if (user.role === "advisor") return or(eq(owner, user.id), sql`${owner} in (select managed.id from ${users} as managed where managed.manager_id = ${user.id} and managed.role in ('user', 'partner'))`);
  return eq(owner, user.id);
}
