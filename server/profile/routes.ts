import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import express, { Router, type NextFunction, type Request, type Response, type RequestHandler } from "express";
import { z } from "zod";
import { getCurrentUser } from "../auth/current-user";
import { config } from "../config";
import { getDatabase } from "../db/client";
import { users } from "../db/schema";
import { validateFile } from "../files/validation";
import { advisorContact } from "./advisor";

export const profileRouter = Router();
const route = (handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler => (req, res, next) => { void handler(req, res, next).catch(next); };
const storage = () => createClient(config.supabaseUrl, config.supabaseServiceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } }).storage.from(config.storageBucket);
const localPhoto = (id: string) => path.resolve(".local/profile-photos", id);
const objectPath = (id: string) => `profiles/${id}/avatar`;

profileRouter.get("/advisor", route(async (req, res) => {
  const current = await getCurrentUser(req); if (!current) return res.status(401).json({ error: "Faça login" });
  if (!getDatabase()) return res.status(503).json({ error: "Banco não configurado" });
  res.setHeader("Cache-Control", "no-store"); return res.json({ advisor: await advisorContact(current) });
}));
profileRouter.get("/", route(async (req, res) => {
  const current = await getCurrentUser(req); if (!current) return res.status(401).json({ error: "Faça login" });
  const [profile] = await getDatabase()!.select({ phone: users.phone }).from(users).where(eq(users.id, current.id)).limit(1);
  return res.json({ phone: profile?.phone ?? null, photoUrl: `/api/profile/photo/${current.id}` });
}));
profileRouter.patch("/", express.json({ limit: "4kb" }), route(async (req, res) => {
  const current = await getCurrentUser(req); if (!current) return res.status(401).json({ error: "Faça login" });
  const parsed = z.object({ phone: z.string().trim().max(32).nullable() }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Informe somente um telefone válido" });
  await getDatabase()!.update(users).set({ phone: parsed.data.phone || null, updatedAt: new Date() }).where(eq(users.id, current.id));
  return res.json({ success: true });
}));
profileRouter.post("/photo", route(async (req, res, next) => {
  const current = await getCurrentUser(req); if (!current) return res.status(401).json({ error: "Faça login" });
  res.locals.profileId = current.id; next();
}), express.raw({ type: ["image/png", "image/jpeg"], limit: "2mb" }), route(async (req, res) => {
  const id: string = res.locals.profileId, mime = req.headers["content-type"]?.split(";")[0] ?? "";
  if (!Buffer.isBuffer(req.body) || !["image/png", "image/jpeg"].includes(mime)) return res.status(400).json({ error: "Envie uma foto PNG ou JPG de até 2 MB" });
  validateFile(req.body, mime, 2 * 1024 * 1024);
  if (config.isProduction) {
    if (!config.supabaseUrl || !config.supabaseServiceRoleKey) return res.status(503).json({ error: "Storage privado não configurado" });
    const result = await storage().upload(objectPath(id), req.body, { contentType: mime, upsert: true });
    if (result.error) return res.status(502).json({ error: "Não foi possível salvar a foto" });
  } else { await mkdir(path.dirname(localPhoto(id)), { recursive: true }); await writeFile(localPhoto(id), req.body); }
  return res.json({ success: true });
}));
profileRouter.get("/photo/:id", route(async (req, res) => {
  const current = await getCurrentUser(req); if (!current) return res.status(401).end();
  if (!z.string().uuid().safeParse(req.params.id).success) return res.status(400).end();
  if (req.params.id !== current.id && (await advisorContact(current))?.id !== req.params.id) return res.status(403).end();
  res.setHeader("Cache-Control", "private, no-store");
  if (config.isProduction) {
    if (!config.supabaseUrl || !config.supabaseServiceRoleKey) return res.status(404).end();
    const result = await storage().createSignedUrl(objectPath(req.params.id), 60);
    return result.data?.signedUrl ? res.redirect(result.data.signedUrl) : res.status(404).end();
  }
  try { const photo = await readFile(localPhoto(req.params.id)); res.type(photo[0] === 137 ? "image/png" : "image/jpeg"); return res.send(photo); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return res.status(404).end(); throw error; }
}));
