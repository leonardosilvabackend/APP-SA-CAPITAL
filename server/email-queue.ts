import { and, asc, eq, isNull, lt, lte, sql } from "drizzle-orm";
import { config } from "./config";
import { getDatabase } from "./db/client";
import { emailJobs } from "./db/schema";
import { sendStatusEmail } from "./email";
import type { StockTransaction } from "./stock/protection";

export async function queueStatusEmail(tx: StockTransaction, name: string, email: string, subject: string, message: string) {
  if (!config.emailEnabled) return;
  await tx.insert(emailJobs).values({ recipientName: name, recipientEmail: email, subject, message });
}
export async function processEmailJobs() {
  if (!config.emailEnabled) return;
  const db = getDatabase()!;
  const jobs = await db.transaction(async tx => {
    const [lock] = await tx.execute<{ acquired: boolean }>(sql`select pg_try_advisory_xact_lock(7365, 3) as acquired`);
    if (!lock?.acquired) return [];
    const pending = await tx.select().from(emailJobs).where(and(isNull(emailJobs.sentAt), lte(emailJobs.nextAttemptAt, new Date()))).orderBy(asc(emailJobs.nextAttemptAt)).limit(5).for("update", { skipLocked: true });
    // Five messages, each at most three 10-second attempts: lease exceeds the batch budget.
    const lease = new Date(Date.now() + 5 * 60_000);
    for (const job of pending) await tx.update(emailJobs).set({ nextAttemptAt: lease, attempts: job.attempts + 1 }).where(eq(emailJobs.id, job.id));
    return pending.map(job => ({ ...job, nextAttemptAt: lease, attempts: job.attempts + 1 }));
  });
  for (const job of jobs) {
    const claim = and(eq(emailJobs.id, job.id), eq(emailJobs.nextAttemptAt, job.nextAttemptAt), isNull(emailJobs.sentAt));
    try {
      await sendStatusEmail(job.recipientName, job.recipientEmail, job.subject, job.message, job.id);
      await db.update(emailJobs).set({ sentAt: new Date() }).where(claim);
    } catch {
      await db.update(emailJobs).set({ nextAttemptAt: new Date(Date.now() + Math.min(60, 2 ** Math.min(job.attempts - 1, 6)) * 60_000) }).where(claim);
      console.error("[Email] Entrega pendente; nova tentativa programada", job.id);
    }
  }
  await db.delete(emailJobs).where(lt(emailJobs.sentAt, new Date(Date.now() - 30 * 86400000)));
}
