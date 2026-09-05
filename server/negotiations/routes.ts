import { createClient } from "@supabase/supabase-js";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import express, { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import { z } from "zod";
import { canEditNegotiation, cents, paymentInputSchema, paymentTotals, receiptInputSchema, updateNegotiationSchema, type ReceiptInput } from "../../shared/negotiations";
import { getCurrentUser } from "../auth/current-user";
import { config } from "../config";
import { getDatabase } from "../db/client";
import { negotiationPayments, negotiationReceipts, negotiations, users } from "../db/schema";
import { NegotiationError } from "./service";

export const negotiationsRouter = Router();
type User = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
type Database = NonNullable<ReturnType<typeof getDatabase>>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
const storage = () => createClient(config.supabaseUrl, config.supabaseServiceRoleKey, { auth: { persistSession: false } }).storage.from(config.storageBucket);
function asyncRoute(handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => { void handler(req, res, next).catch(error => {
    if (error instanceof NegotiationError) res.status(error.status).json({ error: error.message });
    else next(error);
  }); };
}
export function negotiationScope(user: Pick<User, "id" | "role">) {
  if (["admin", "administrative"].includes(user.role)) return undefined;
  if (user.role === "advisor") return or(eq(negotiations.ownerId, user.id), eq(users.managerId, user.id));
  return eq(negotiations.ownerId, user.id);
}
async function accessible(db: Database | Transaction, id: string, user: User, lock = false) {
  const query = db.select({ item: negotiations, ownerName: users.name }).from(negotiations)
    .innerJoin(users, eq(users.id, negotiations.ownerId)).where(and(eq(negotiations.id, id), negotiationScope(user)));
  const [row] = await (lock ? query.for("update", { of: negotiations }) : query);
  if (!row) throw new NegotiationError(404, "Negociação não encontrada");
  return row;
}
function requireVersion(actual: number, expected: number) {
  if (actual !== expected) throw new NegotiationError(409, "A negociação foi atualizada por outra pessoa. Recarregue os dados antes de salvar");
}
negotiationsRouter.use(asyncRoute(async (req, res, next) => {
  if (!getDatabase()) return res.status(503).json({ error: "Banco não configurado" });
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: "Faça login para continuar" });
  if (!["GET", "HEAD"].includes(req.method) && !canEditNegotiation(user.role)) return res.status(403).json({ error: "Somente administrador, assessor e administrativo podem alterar negociações" });
  res.locals.negotiationUser = user;
  next();
}));
for (const name of ["id", "paymentId", "receiptId"]) negotiationsRouter.param(name, (_req, res, next, value) => {
  if (!z.string().uuid().safeParse(value).success) { res.status(400).json({ error: "Identificador inválido" }); return; }
  next();
});
negotiationsRouter.get("/", asyncRoute(async (_req, res) => {
  const db = getDatabase()!;
  const rows = await db.select({ item: negotiations, ownerName: users.name }).from(negotiations)
    .innerJoin(users, eq(users.id, negotiations.ownerId)).where(negotiationScope(res.locals.negotiationUser)).orderBy(desc(negotiations.createdAt));
  const payments = rows.length ? await db.select({ negotiationId: negotiationPayments.negotiationId, amount: negotiationPayments.amount, kind: negotiationPayments.kind })
    .from(negotiationPayments).where(inArray(negotiationPayments.negotiationId, rows.map(row => row.item.id))) : [];
  return res.json({ items: rows.map(({ item, ownerName }) => ({ ...item, ownerName, ...paymentTotals(item.entryAmount, payments.filter(payment => payment.negotiationId === item.id)) })) });
}));
negotiationsRouter.get("/:id", asyncRoute(async (req, res) => {
  const db = getDatabase()!;
  const { item, ownerName } = await accessible(db, req.params.id, res.locals.negotiationUser);
  const payments = await db.select({ payment: negotiationPayments, recordedByName: users.name }).from(negotiationPayments)
    .innerJoin(users, eq(users.id, negotiationPayments.recordedBy)).where(eq(negotiationPayments.negotiationId, item.id)).orderBy(desc(negotiationPayments.paidAt), desc(negotiationPayments.createdAt));
  const receipts = payments.length ? await db.select().from(negotiationReceipts).where(inArray(negotiationReceipts.paymentId, payments.map(row => row.payment.id))) : [];
  return res.json({ item: { ...item, ownerName, ...paymentTotals(item.entryAmount, payments.map(row => row.payment)),
    payments: payments.map(({ payment, recordedByName }) => ({ ...payment, recordedByName,
      receipts: receipts.filter(receipt => receipt.paymentId === payment.id).map(receipt => ({
        id: receipt.id, fileName: receipt.fileName, createdAt: receipt.createdAt,
        url: `/api/negotiations/${item.id}/payments/${payment.id}/receipts/${receipt.id}`,
      })),
    })),
  } });
}));
negotiationsRouter.patch("/:id", express.json({ limit: "20kb" }), asyncRoute(async (req, res) => {
  const parsed = updateNegotiationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const user: User = res.locals.negotiationUser;
  await getDatabase()!.transaction(async tx => {
    const { item } = await accessible(tx, req.params.id, user, true);
    requireVersion(item.version, parsed.data.version);
    const payments = await tx.select().from(negotiationPayments).where(eq(negotiationPayments.negotiationId, item.id));
    const totals = paymentTotals(parsed.data.entryAmount, payments);
    if (cents(totals.remainingAmount) < 0) throw new NegotiationError(400, "A entrada não pode ser menor que o total já pago");
    if (parsed.data.status === "finalized" && cents(totals.remainingAmount) !== 0) throw new NegotiationError(400, "Quite o valor de entrada antes de finalizar a negociação");
    const { version, ...fields } = parsed.data;
    await tx.update(negotiations).set({ ...fields, version: version + 1, updatedBy: user.id, updatedAt: new Date() }).where(eq(negotiations.id, item.id));
  });
  return res.json({ message: "Negociação atualizada" });
}));

async function uploadReceipt(input: ReceiptInput, negotiationId: string) {
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) throw new NegotiationError(503, "Armazenamento de comprovantes não configurado");
  const buffer = Buffer.from(input.base64, "base64");
  const valid = input.mimeType === "application/pdf" ? buffer.subarray(0, 5).toString() === "%PDF-"
    : input.mimeType === "image/png" ? buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
  if (!valid) throw new NegotiationError(400, "O conteúdo do comprovante não corresponde ao formato informado");
  const path = `negotiations/${negotiationId}/${crypto.randomUUID()}`;
  const result = await storage().upload(path, buffer, { contentType: input.mimeType, upsert: false });
  if (result.error) throw new NegotiationError(502, "Não foi possível enviar o comprovante. Tente novamente");
  return path;
}
async function removeUploaded(path: string) {
  try { const result = await storage().remove([path]); if (result.error) console.error("[Negociações] Falha ao remover comprovante incompleto", result.error.message); }
  catch { console.error("[Negociações] Falha ao remover comprovante incompleto"); }
}
async function savePayment(req: Request, res: Response, editing: boolean) {
  const parsed = paymentInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const data = parsed.data;
  if (editing && data.id !== req.params.paymentId) return res.status(400).json({ error: "Pagamento inválido" });
  const user: User = res.locals.negotiationUser;
  let uploaded: string | undefined;
  try {
    await getDatabase()!.transaction(async tx => {
      const { item } = await accessible(tx, req.params.id, user, true);
      const payments = await tx.select().from(negotiationPayments).where(eq(negotiationPayments.negotiationId, item.id));
      const existing = payments.find(payment => payment.id === data.id);
      // Retrying a successful creation must not count a payment twice.
      if (!editing && existing) {
        if (cents(existing.amount) !== cents(data.amount) || existing.kind !== data.kind || existing.paidAt.getTime() !== new Date(data.paidAt).getTime()) {
          throw new NegotiationError(409, "Este pagamento já foi registrado com outros valores. Confira o histórico e use Editar pagamento");
        }
        return;
      }
      if (editing && !existing) throw new NegotiationError(404, "Pagamento não encontrado");
      requireVersion(item.version, data.version);
      if (["finalized", "cancelled"].includes(item.status)) throw new NegotiationError(409, "Reabra a negociação antes de alterar pagamentos");
      const total = payments.filter(payment => payment.id !== data.id).reduce((sum, payment) => sum + cents(payment.amount), 0) + cents(data.amount);
      if (total > cents(item.entryAmount)) throw new NegotiationError(400, "Os pagamentos não podem ultrapassar o valor de entrada");
      if (data.receipt) uploaded = await uploadReceipt(data.receipt, item.id);
      const values = { kind: data.kind, amount: data.amount, paidAt: new Date(data.paidAt), updatedBy: user.id, updatedAt: new Date() };
      if (editing) await tx.update(negotiationPayments).set(values).where(eq(negotiationPayments.id, data.id));
      else await tx.insert(negotiationPayments).values({ id: data.id, negotiationId: item.id, recordedBy: user.id, ...values });
      if (data.receipt && uploaded) await tx.insert(negotiationReceipts).values({ id: data.receipt.id, paymentId: data.id, fileName: data.receipt.name, mimeType: data.receipt.mimeType, storagePath: uploaded, uploadedBy: user.id });
      await tx.update(negotiations).set({ version: sql`${negotiations.version} + 1`, updatedBy: user.id, updatedAt: new Date() }).where(eq(negotiations.id, item.id));
    });
  } catch (error) { if (uploaded) await removeUploaded(uploaded); throw error; }
  return res.status(editing ? 200 : 201).json({ message: "Pagamento salvo" });
}
negotiationsRouter.post("/:id/payments", express.json({ limit: "15mb" }), asyncRoute((req, res) => savePayment(req, res, false)));
negotiationsRouter.patch("/:id/payments/:paymentId", express.json({ limit: "15mb" }), asyncRoute((req, res) => savePayment(req, res, true)));

negotiationsRouter.post("/:id/payments/:paymentId/receipts", express.json({ limit: "15mb" }), asyncRoute(async (req, res) => {
  const parsed = receiptInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const user: User = res.locals.negotiationUser;
  let uploaded: string | undefined;
  try {
    await getDatabase()!.transaction(async tx => {
      const { item } = await accessible(tx, req.params.id, user, true);
      const [payment] = await tx.select().from(negotiationPayments).where(and(eq(negotiationPayments.id, req.params.paymentId), eq(negotiationPayments.negotiationId, item.id)));
      if (!payment) throw new NegotiationError(404, "Pagamento não encontrado");
      const [existing] = await tx.select().from(negotiationReceipts).where(eq(negotiationReceipts.id, parsed.data.id));
      if (existing) {
        if (existing.paymentId !== payment.id) throw new NegotiationError(409, "Identificador de comprovante já utilizado");
        return;
      }
      uploaded = await uploadReceipt(parsed.data, item.id);
      await tx.insert(negotiationReceipts).values({ id: parsed.data.id, paymentId: payment.id, fileName: parsed.data.name, mimeType: parsed.data.mimeType, storagePath: uploaded, uploadedBy: user.id });
      await tx.update(negotiations).set({ version: sql`${negotiations.version} + 1`, updatedBy: user.id, updatedAt: new Date() }).where(eq(negotiations.id, item.id));
    });
  } catch (error) { if (uploaded) await removeUploaded(uploaded); throw error; }
  return res.status(201).json({ message: "Comprovante anexado" });
}));
negotiationsRouter.get("/:id/payments/:paymentId/receipts/:receiptId", asyncRoute(async (req, res) => {
  const db = getDatabase()!;
  await accessible(db, req.params.id, res.locals.negotiationUser);
  const [row] = await db.select({ receipt: negotiationReceipts }).from(negotiationReceipts)
    .innerJoin(negotiationPayments, eq(negotiationPayments.id, negotiationReceipts.paymentId))
    .where(and(eq(negotiationReceipts.id, req.params.receiptId), eq(negotiationPayments.id, req.params.paymentId), eq(negotiationPayments.negotiationId, req.params.id)));
  if (!row) return res.status(404).json({ error: "Comprovante não encontrado" });
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) return res.status(503).json({ error: "Armazenamento não configurado" });
  const result = await storage().createSignedUrl(row.receipt.storagePath, 60, { download: row.receipt.fileName });
  if (result.error) return res.status(502).json({ error: "Não foi possível abrir o comprovante" });
  res.setHeader("Cache-Control", "private, no-store");
  return res.redirect(result.data.signedUrl);
}));
negotiationsRouter.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
  const status = (error as { status?: number })?.status;
  if (status === 413) { res.status(413).json({ error: "O comprovante deve ter até 10 MB" }); return; }
  if (status === 400) { res.status(400).json({ error: "Dados inválidos na solicitação" }); return; }
  next(error);
});
