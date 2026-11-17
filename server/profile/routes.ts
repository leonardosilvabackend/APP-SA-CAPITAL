import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, desc, eq } from "drizzle-orm";
import express, { Router, type NextFunction, type Request, type Response, type RequestHandler } from "express";
import { z } from "zod";
import { getCurrentUser } from "../auth/current-user";
import { config } from "../config";
import { getDatabase } from "../db/client";
import { stockAlertPreferences, stockSearchWishes, userProfiles } from "../db/schema";
import { hasAlertCriteria } from "../stock/alerts";
import { validateFile } from "../files/validation";
import { advisorContact } from "./advisor";
import { storageIsConfigured, storageProvider } from "../storage/provider";

export const profileRouter = Router();
const route = (handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler => (req, res, next) => { void handler(req, res, next).catch(next); };
const localPhoto = (id: string) => path.resolve(".local/profile-photos", id);
const objectPath = (id: string) => `profiles/${id}/avatar`;

profileRouter.get("/advisor", route(async (req, res) => {
  const current = await getCurrentUser(req); if (!current) return res.status(401).json({ error: "Faça login" });
  if (!getDatabase()) return res.status(503).json({ error: "Banco não configurado" });
  res.setHeader("Cache-Control", "no-store"); return res.json({ advisor: await advisorContact(current) });
}));
profileRouter.get("/", route(async (req, res) => {
  const current = await getCurrentUser(req); if (!current) return res.status(401).json({ error: "Faça login" });
  const [profile] = await getDatabase()!.select().from(userProfiles).where(eq(userProfiles.userId, current.id)).limit(1);
  return res.json({ ...(profile ?? {}), photoUrl: `/api/profile/photo/${current.id}` });
}));
profileRouter.patch("/", express.json({ limit: "4kb" }), route(async (req, res) => {
  const current = await getCurrentUser(req); if (!current) return res.status(401).json({ error: "Faça login" });
  const nullable = (max: number) => z.string().trim().max(max).nullable().optional();
  const parsed = z.object({ firstName: nullable(100), lastName: nullable(100), gender: z.enum(["Feminino", "Masculino", "Prefiro não dizer"]).or(z.literal("")).nullable().optional().transform(value => value || null), phone: nullable(32), email: z.string().trim().email().max(320).nullable().optional(), taxDocument: nullable(30), companyName: nullable(180), address: nullable(1000), interestedAdministrators: z.array(z.string().trim().min(1).max(160)).max(100).optional() }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Informe somente um telefone válido" });
  const values = { ...parsed.data, updatedAt: new Date() };
  await getDatabase()!.insert(userProfiles).values({ userId: current.id, ...values }).onConflictDoUpdate({ target: userProfiles.userId, set: values });
  return res.json({ success: true });
}));
profileRouter.get("/stock-alert", route(async (req, res) => { const current = await getCurrentUser(req); if (!current) return res.status(401).json({ error: "Faça login" }); const [item] = await getDatabase()!.select().from(stockAlertPreferences).where(eq(stockAlertPreferences.userId, current.id)); return res.json({ item: item ?? null }); }));
profileRouter.put("/stock-alert", express.json({ limit: "4kb" }), route(async (req, res) => {
  const current = await getCurrentUser(req); if (!current) return res.status(401).json({ error: "Faça login" });
  const optionalNumber = z.coerce.number().nonnegative().optional().nullable();
  const parsed = z.object({ administrator: z.string().trim().max(160).optional().nullable(), category: z.string().trim().max(80).optional().nullable(), desiredCredit: optionalNumber, maxEntryPercent: z.coerce.number().min(0).max(100).optional().nullable(), maxInstallment: optionalNumber, minOutstandingBalance: optionalNumber, maxOutstandingBalance: optionalNumber, outstandingBalanceRelation: z.enum(["below_credit", "above_credit"]).optional().nullable(), active: z.boolean().default(true) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Critérios inválidos" });
  if (parsed.data.active && !hasAlertCriteria(parsed.data)) return res.status(400).json({ error: "Informe ao menos um critério para ativar o alerta" });
  const values = { ...parsed.data, desiredCredit: parsed.data.desiredCredit?.toString() ?? null, maxEntryPercent: parsed.data.maxEntryPercent?.toString() ?? null, maxInstallment: parsed.data.maxInstallment?.toString() ?? null, minOutstandingBalance: parsed.data.minOutstandingBalance?.toString() ?? null, maxOutstandingBalance: parsed.data.maxOutstandingBalance?.toString() ?? null, updatedAt: new Date() };
  await getDatabase()!.insert(stockAlertPreferences).values({ userId: current.id, ...values }).onConflictDoUpdate({ target: stockAlertPreferences.userId, set: values });
  return res.json({ success: true });
}));
profileRouter.get("/stock-wishes", route(async (req, res) => { const current = await getCurrentUser(req); if (!current) return res.status(401).json({ error: "Faça login" }); const items = await getDatabase()!.select().from(stockSearchWishes).where(and(eq(stockSearchWishes.userId, current.id), eq(stockSearchWishes.active, true))).orderBy(desc(stockSearchWishes.createdAt)); return res.json({ items }); }));
profileRouter.delete("/stock-wishes/:id", route(async (req, res) => { const current = await getCurrentUser(req); if (!current) return res.status(401).json({ error: "Faça login" }); const [item] = await getDatabase()!.update(stockSearchWishes).set({ active: false }).where(and(eq(stockSearchWishes.id, req.params.id), eq(stockSearchWishes.userId, current.id))).returning({ id: stockSearchWishes.id }); return item ? res.status(204).end() : res.status(404).json({ error: "Pedido não encontrado" }); }));
profileRouter.post("/photo", route(async (req, res, next) => {
  const current = await getCurrentUser(req); if (!current) return res.status(401).json({ error: "Faça login" });
  res.locals.profileId = current.id; next();
}), express.raw({ type: ["image/png", "image/jpeg"], limit: "2mb" }), route(async (req, res) => {
  const id: string = res.locals.profileId, mime = req.headers["content-type"]?.split(";")[0] ?? "";
  if (!Buffer.isBuffer(req.body) || !["image/png", "image/jpeg"].includes(mime)) return res.status(400).json({ error: "Envie uma foto PNG ou JPG de até 2 MB" });
  validateFile(req.body, mime, 2 * 1024 * 1024);
  if (config.isProduction) {
    if (!storageIsConfigured()) return res.status(503).json({ error: "Storage privado não configurado" });
    const result = await storageProvider().upload(objectPath(id), req.body, { contentType: mime, upsert: true });
    if (result.error) return res.status(502).json({ error: "Não foi possível salvar a foto" });
  } else { await mkdir(path.dirname(localPhoto(id)), { recursive: true }); await writeFile(localPhoto(id), req.body); }
  return res.json({ success: true });
}));
profileRouter.get("/photo/:id", route(async (req, res) => {
  const current = await getCurrentUser(req); if (!current) return res.status(401).end();
  if (!z.string().uuid().safeParse(req.params.id).success) return res.status(400).end();
  if (req.params.id !== current.id && (await advisorContact(current))?.id !== req.params.id) return res.status(403).end();
  res.setHeader("Cache-Control", "private, max-age=3600");
  if (config.isProduction) {
    if (!storageIsConfigured()) return res.status(404).end();
    const result = await storageProvider().createSignedUrl(objectPath(req.params.id), 3_600);
    return result.data?.signedUrl ? res.redirect(result.data.signedUrl) : res.status(404).end();
  }
  try { const photo = await readFile(localPhoto(req.params.id)); res.type(photo[0] === 137 ? "image/png" : "image/jpeg"); return res.send(photo); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return res.status(404).end(); throw error; }
}));
