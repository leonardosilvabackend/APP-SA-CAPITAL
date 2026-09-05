import { createClient } from "@supabase/supabase-js";
import { asc, eq } from "drizzle-orm";
import express, { Router, type Request, type Response, type NextFunction, type RequestHandler } from "express";
import { administratorInputSchema, type AdministratorFile } from "../../shared/administrators";
import { getCurrentUser } from "../auth/current-user";
import { config } from "../config";
import { getDatabase } from "../db/client";
import { administrators } from "../db/schema";

export const administratorsRouter = Router();
const storage = () => createClient(config.supabaseUrl, config.supabaseServiceRoleKey, { auth: { persistSession: false } }).storage.from(config.storageBucket);
function asyncRoute(handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => { void handler(req, res, next).catch(next); };
}
function serialize(item: typeof administrators.$inferSelect) {
  const base = `/api/administrators/${item.id}/files/`;
  return { id: item.id, name: item.name, characteristics: item.characteristics, website: item.website,
    logo: item.logo ? base + item.logo.id : undefined,
    documents: item.documents.map(doc => ({ id: doc.id, name: doc.name, url: base + doc.id })) };
}
administratorsRouter.use(asyncRoute(async (req, res, next) => {
  if (!getDatabase()) return res.status(503).json({ error: "Banco não configurado" });
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: "Faça login" });
  if (req.method !== "GET" && user.role !== "admin") return res.status(403).json({ error: "Somente o administrador pode cadastrar administradoras" });
  next();
}));
administratorsRouter.get("/", asyncRoute(async (_req, res) => {
  const items = await getDatabase()!.select().from(administrators).orderBy(asc(administrators.name));
  return res.json({ items: items.map(serialize) });
}));
administratorsRouter.post("/", express.json({ limit: "15mb" }), asyncRoute(async (req, res) => {
  const parsed = administratorInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const { logo, documents, ...fields } = parsed.data;
  if ((logo || documents.length) && (!config.supabaseUrl || !config.supabaseServiceRoleKey)) return res.status(503).json({ error: "Armazenamento de arquivos não configurado" });
  const id = crypto.randomUUID();
  const uploaded: string[] = [];
  async function upload(file: (typeof documents)[number]): Promise<AdministratorFile> {
    const fileId = crypto.randomUUID();
    const storagePath = `administrators/${id}/${fileId}`;
    const result = await storage().upload(storagePath, Buffer.from(file.base64, "base64"), { contentType: file.mimeType, upsert: false });
    if (result.error) throw new Error("Não foi possível enviar os arquivos da administradora");
    uploaded.push(storagePath);
    return { id: fileId, name: file.name, mimeType: file.mimeType, storagePath };
  }
  try {
    const savedLogo = logo ? await upload(logo) : null;
    const savedDocuments: AdministratorFile[] = [];
    for (const file of documents) savedDocuments.push(await upload(file));
    const [item] = await getDatabase()!.insert(administrators).values({ id, ...fields, website: fields.website || null, logo: savedLogo, documents: savedDocuments }).returning();
    return res.status(201).json({ item: serialize(item) });
  } catch (error) {
    if (uploaded.length) await storage().remove(uploaded).catch(() => undefined);
    throw error;
  }
}));
administratorsRouter.get("/:id/files/:fileId", asyncRoute(async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(400).json({ error: "Identificador inválido" });
  const [item] = await getDatabase()!.select().from(administrators).where(eq(administrators.id, req.params.id)).limit(1);
  const file = item && [item.logo, ...item.documents].find(file => file?.id === req.params.fileId);
  if (!file) return res.status(404).json({ error: "Arquivo não encontrado" });
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) return res.status(503).json({ error: "Armazenamento de arquivos não configurado" });
  const result = await storage().createSignedUrl(file.storagePath, 60, item.logo?.id === file.id ? undefined : { download: file.name });
  if (result.error) return res.status(502).json({ error: "Não foi possível abrir o arquivo" });
  res.setHeader("Cache-Control", "private, no-store");
  return res.redirect(result.data.signedUrl);
}));
