import { and, asc, eq, ilike } from "drizzle-orm";
import { getDatabase } from "../db/client";
import { users } from "../db/schema";
import type { AuthenticatedUser } from "../../shared/contracts";
import type { AdvisorContact } from "../../shared/profile";

export async function advisorContact(user: Pick<AuthenticatedUser, "managerId">): Promise<AdvisorContact | null> {
  const db = getDatabase(); if (!db) return null;
  const fields = { id: users.id, name: users.name, phone: users.phone };
  if (user.managerId) {
    const [advisor] = await db.select(fields).from(users).where(and(eq(users.id, user.managerId), eq(users.role, "advisor"), eq(users.status, "active"))).limit(1);
    if (advisor) return { ...advisor, photoUrl: `/api/profile/photo/${advisor.id}`, fallback: false };
  }
  // An effective fallback does not rewrite managerId or broaden ownership scope.
  const [leonardo] = await db.select(fields).from(users).where(and(eq(users.role, "admin"), eq(users.status, "active"), ilike(users.name, "Leonardo%"))).orderBy(asc(users.createdAt), asc(users.id)).limit(1);
  return leonardo ? { ...leonardo, photoUrl: `/api/profile/photo/${leonardo.id}`, fallback: true } : null;
}
