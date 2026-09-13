import { pagination, pageResult } from "../pagination";
import { queueStatusEmail } from "../email-queue";
import { queueStorageCleanup } from "../files/cleanup";
import { z } from "zod";
import { validateFile } from "../files/validation";
import { AnalysisError, validateSubmission } from "./submission";
import { ownershipScope } from "../auth/ownership";
import { createClient } from "@supabase/supabase-js";
import { and, desc, eq, inArray, lt, or } from "drizzle-orm";
import express, { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import { createPreAnalysisSchema, updatePreAnalysisSchema } from "../../shared/contracts";
import { getCurrentUser } from "../auth/current-user";
import { config } from "../config";
import { getDatabase } from "../db/client";
import { appSettings, preAnalyses, preAnalysisDocuments, users } from "../db/schema";
export const preAnalysesRouter=Router();
for (const name of ["id", "documentId"]) preAnalysesRouter.param(name, (_req, res, next, value) => {
  if (!z.string().uuid().safeParse(value).success) { res.status(400).json({ error: "Identificador invalido" }); return; }
  next();
});
const storage=()=>createClient(config.supabaseUrl,config.supabaseServiceRoleKey,{auth:{persistSession:false}}).storage.from(config.storageBucket);
function asyncRoute(handler:(req:Request,res:Response,next:NextFunction)=>Promise<unknown>):RequestHandler{return(req,res,next)=>{void handler(req,res,next).catch(error => { if (error instanceof AnalysisError) res.status(error.status).json({ error: error.message }); else next(error); });};}
function scope(user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>) { return ownershipScope(preAnalyses.partnerId, user, true); }
export async function cleanupExpiredDocuments(){const db=getDatabase();if(!db||!config.supabaseUrl||!config.supabaseServiceRoleKey)return;const expired=await db.select().from(preAnalysisDocuments).where(lt(preAnalysisDocuments.expiresAt,new Date()));if(expired.length){const removed = await storage().remove(expired.map(d=>d.storagePath));if(removed.error) throw new Error("Document cleanup failed; records preserved for retry");await db.delete(preAnalysisDocuments).where(inArray(preAnalysisDocuments.id,expired.map(d=>d.id)));}}
preAnalysesRouter.delete("/:id", asyncRoute(async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: "Faça login" });
  if (!["admin", "administrative"].includes(user.role)) {
    return res.status(403).json({ error: "Somente administradores e administrativos podem excluir pré-análises" });
  }
  const db = getDatabase()!;
  await db.transaction(async tx => {
    const [item] = await tx.select({ id: preAnalyses.id }).from(preAnalyses).where(eq(preAnalyses.id, req.params.id)).for("update");
    if (!item) throw new AnalysisError(404, "Pre-analise nao encontrada");
    const documents = await tx.select({ storagePath: preAnalysisDocuments.storagePath }).from(preAnalysisDocuments).where(eq(preAnalysisDocuments.preAnalysisId, item.id));
    await queueStorageCleanup(documents.map(document => document.storagePath), tx);
    await tx.delete(preAnalyses).where(eq(preAnalyses.id, item.id));
  });
  return res.json({ success: true });
}));
preAnalysesRouter.get("/",asyncRoute(async(req,res)=>{const user=await getCurrentUser(req);if(!user)return res.status(401).json({error:"Faça login"});const db=getDatabase()!;const fields={id:preAnalyses.id,partnerId:preAnalyses.partnerId,partnerName:users.name,customerType:preAnalyses.customerType,customerName:preAnalyses.customerName,document:preAnalyses.document,incomeType:preAnalyses.incomeType,status:preAnalyses.status,observations:preAnalyses.observations,administratorId:preAnalyses.administratorId,consentAt:preAnalyses.consentAt,returnedAt:preAnalyses.returnedAt,createdAt:preAnalyses.createdAt,updatedAt:preAnalyses.updatedAt};const paging=pagination(req);const base=db.select(fields).from(preAnalyses).innerJoin(users,eq(preAnalyses.partnerId,users.id));const access=scope(user);const rows=await base.where(access).orderBy(desc(preAnalyses.createdAt),desc(preAnalyses.id)).limit(paging.pageSize+1).offset(paging.offset);const page=pageResult(rows,paging);const items=page.items;const docs=items.length?await db.select().from(preAnalysisDocuments).where(inArray(preAnalysisDocuments.preAnalysisId,items.map(i=>i.id))):[];return res.json({...page,items:items.map(i=>({...i,documents:docs.filter(d=>d.preAnalysisId===i.id).map(({storagePath:_p,...d})=>d)}))});}));
preAnalysesRouter.post("/",asyncRoute(async(req,res)=>{const user=await getCurrentUser(req);if(!user||user.role==="administrative")return res.status(403).json({error:"Seu perfil não envia pré-análises"});const parsed=createPreAnalysisSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:parsed.error.issues[0]?.message});const db=getDatabase()!;const {consent,...data}=parsed.data;const [item]=await db.insert(preAnalyses).values({...data,status:"draft",partnerId:user.id,consentAt:new Date()}).returning();return res.status(201).json({item,message:"Rascunho salvo. Anexe os documentos obrigatorios e conclua o envio."});}));
preAnalysesRouter.post("/:id/submit", asyncRoute(async (req, res) => {
  const user = await getCurrentUser(req); if (!user) return res.status(401).json({ error: "Faca login" });
  const item = await getDatabase()!.transaction(async tx => {
    const [analysis] = await tx.select().from(preAnalyses).where(and(eq(preAnalyses.id, req.params.id), scope(user))).for("update");
    if (!analysis) throw new AnalysisError(404, "Pre-analise nao encontrada");
    if (analysis.status === "received") return analysis;
    if (!["draft", "documents_requested"].includes(analysis.status)) throw new AnalysisError(409, "Esta pre-analise ja foi enviada");
    await validateSubmission(tx, analysis);
    return (await tx.update(preAnalyses).set({ status: "received", returnedAt: null, updatedAt: new Date() }).where(eq(preAnalyses.id, analysis.id)).returning())[0];
  });
  return res.json({ item });
}));
preAnalysesRouter.patch("/:id", asyncRoute(async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user || !["admin", "administrative"].includes(user.role)) return res.status(403).json({ error: "Somente a equipe administrativa analisa" });
  const parsed = updatePreAnalysisSchema.safeParse(req.body);
  if (!parsed.success || parsed.data.status === "draft") return res.status(400).json({ error: "Dados invalidos" });
  const db = getDatabase()!;
  const item = await db.transaction(async tx => {
    const [existing] = await tx.select().from(preAnalyses).where(eq(preAnalyses.id, req.params.id)).for("update");
    if (!existing) throw new AnalysisError(404, "Pre-analise nao encontrada");
    if (existing.status === "draft") throw new AnalysisError(409, "Aguarde a submissao dos documentos pelo responsavel");
    if (parsed.data.status === "approved") await validateSubmission(tx, existing);
    const completed = ["approved", "rejected"].includes(parsed.data.status);
    const returnedAt = completed ? existing.returnedAt ?? new Date() : null;
    const [updated] = await tx.update(preAnalyses).set({ status: parsed.data.status, observations: parsed.data.observations, administratorId: user.id, returnedAt, updatedAt: new Date() }).where(eq(preAnalyses.id, existing.id)).returning();
    await tx.update(preAnalysisDocuments).set({ expiresAt: returnedAt ? new Date(returnedAt.getTime() + 10 * 86400000) : null }).where(eq(preAnalysisDocuments.preAnalysisId, existing.id));
    if (completed && existing.status !== parsed.data.status) {
      const [owner] = await tx.select().from(users).where(eq(users.id, existing.partnerId));
      if (owner) await queueStatusEmail(tx, owner.name, owner.email, "Retorno da pre-analise", `A pre-analise de ${existing.customerName} foi atualizada para ${parsed.data.status}.`);
    }
    return updated;
  });
  return res.json({ item });
}));
const authorizeUpload = asyncRoute(async (req, res, next) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: "Faca login" });
  const [item] = await getDatabase()!.select({ id: preAnalyses.id }).from(preAnalyses).where(and(eq(preAnalyses.id, req.params.id), scope(user)));
  if (!item) return res.status(404).json({ error: "Pre-analise nao encontrada" });
  res.locals.uploadUser = user;
  next();
});
preAnalysesRouter.post("/:id/documents", authorizeUpload, express.raw({ type: ["application/pdf", "image/jpeg", "image/png"], limit: "25mb" }), asyncRoute(async (req, res) => {
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) return res.status(503).json({ error: "Armazenamento privado nao configurado" });
  const mime = req.headers["content-type"]?.split(";")[0] ?? "";
  const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const fileName = decodeURIComponent(String(req.headers["x-file-name"] ?? "documento")).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 255);
  const documentType = decodeURIComponent(String(req.headers["x-document-type"] ?? "Documento")).trim().slice(0, 100);
  const path = `${req.params.id}/${crypto.randomUUID()}-${fileName}`;
  let uploaded = false;
  try {
    const [settings] = await getDatabase()!.select().from(appSettings).where(eq(appSettings.id, "default"));
    if (!settings?.allowedFileTypes.includes(mime)) throw new AnalysisError(400, "Tipo de arquivo nao permitido");
    validateFile(body, mime, settings.maxFileSizeMb * 1024 * 1024);
    const result = await storage().upload(path, body, { contentType: mime, upsert: false });
    if (result.error) throw new AnalysisError(502, "Nao foi possivel enviar o documento");
    uploaded = true;
    const document = await getDatabase()!.transaction(async tx => {
      const [analysis] = await tx.select().from(preAnalyses).where(and(eq(preAnalyses.id, req.params.id), scope(res.locals.uploadUser))).for("update");
      if (!analysis) throw new AnalysisError(404, "Pre-analise nao encontrada");
      if (!["draft", "documents_requested"].includes(analysis.status)) throw new AnalysisError(409, "Solicite a reabertura antes de anexar documentos");
      const [settings] = await tx.select().from(appSettings).where(eq(appSettings.id, "default"));
      if (!settings?.allowedFileTypes.includes(mime)) throw new AnalysisError(400, "Tipo de arquivo nao permitido");
      validateFile(body, mime, settings.maxFileSizeMb * 1024 * 1024);
      const existing = await tx.select().from(preAnalysisDocuments).where(eq(preAnalysisDocuments.preAnalysisId, analysis.id));
      const previous = existing.filter(doc => doc.documentType === documentType);
      const retained = existing.filter(doc => doc.documentType !== documentType);
      if (retained.length >= 30 || retained.reduce((total, doc) => total + doc.size, body.length) > 100 * 1024 * 1024) throw new AnalysisError(413, "Limite de documentos desta pre-analise atingido");
      if (previous.length) { await queueStorageCleanup(previous.map(doc => doc.storagePath), tx); await tx.delete(preAnalysisDocuments).where(inArray(preAnalysisDocuments.id, previous.map(doc => doc.id))); }
      return (await tx.insert(preAnalysisDocuments).values({ preAnalysisId: analysis.id, documentType, fileName, storagePath: path, mimeType: mime, size: body.length }).returning())[0];
    });
    return res.status(201).json({ document: { ...document, storagePath: undefined } });
  } catch (error) {
    if (uploaded) { await queueStorageCleanup([path]); const result = await storage().remove([path]).catch(() => ({ error: true })); if (result.error) console.error("[Storage] Falha na compensacao de upload", path); }
    throw error;
  }
}));
preAnalysesRouter.get("/:id/documents/:documentId", asyncRoute(async (req, res) => {
  const user = await getCurrentUser(req); if (!user) return res.status(401).json({ error: "Faca login" });
  const [doc] = await getDatabase()!.select({ path: preAnalysisDocuments.storagePath, name: preAnalysisDocuments.fileName, expiresAt: preAnalysisDocuments.expiresAt }).from(preAnalysisDocuments).innerJoin(preAnalyses, eq(preAnalysisDocuments.preAnalysisId, preAnalyses.id)).where(and(eq(preAnalysisDocuments.id, req.params.documentId), eq(preAnalyses.id, req.params.id), scope(user)));
  if (!doc) return res.status(404).json({ error: "Documento nao encontrado" });
  if (doc.expiresAt && doc.expiresAt <= new Date()) return res.status(410).json({ error: "Documento expirado" });
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) return res.status(503).json({ error: "Armazenamento privado nao configurado" });
  const signed = await storage().createSignedUrl(doc.path, 60, { download: doc.name });
  if (signed.error) return res.status(502).json({ error: "Nao foi possivel abrir o documento" });
  res.setHeader("Cache-Control", "private, no-store");
  return res.json({ url: signed.data.signedUrl });
}));
