import { and, desc, eq } from "drizzle-orm";
import { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import { createPreAnalysisSchema, updatePreAnalysisSchema } from "../../shared/contracts";
import { getCurrentUser } from "../auth/current-user";
import { getDatabase } from "../db/client";
import { preAnalyses, users } from "../db/schema";

export const preAnalysesRouter = Router();
function asyncRoute(handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler { return (req, res, next) => { void handler(req, res, next).catch(next); }; }

preAnalysesRouter.get("/", asyncRoute(async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: "Faça login para continuar" });
  const db = getDatabase();
  if (!db) return res.status(503).json({ error: "Banco de dados não configurado" });
  const fields = { id: preAnalyses.id, partnerId: preAnalyses.partnerId, partnerName: users.name, customerType: preAnalyses.customerType, customerName: preAnalyses.customerName, document: preAnalyses.document, status: preAnalyses.status, createdAt: preAnalyses.createdAt, updatedAt: preAnalyses.updatedAt };
  const base = db.select(fields).from(preAnalyses).innerJoin(users, eq(preAnalyses.partnerId, users.id));
  const items = user.role === "admin" ? await base.orderBy(desc(preAnalyses.createdAt)) : await base.where(eq(preAnalyses.partnerId, user.id)).orderBy(desc(preAnalyses.createdAt));
  return res.json({ items });
}));

preAnalysesRouter.post("/", asyncRoute(async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: "Faça login para continuar" });
  const parsed = createPreAnalysisSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" });
  const db = getDatabase();
  if (!db) return res.status(503).json({ error: "Banco de dados não configurado" });
  const [item] = await db.insert(preAnalyses).values({ ...parsed.data, partnerId: user.id }).returning();
  return res.status(201).json({ item });
}));

preAnalysesRouter.patch("/:id", asyncRoute(async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: "Faça login para continuar" });
  const parsed = updatePreAnalysisSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Status inválido" });
  const db = getDatabase();
  if (!db) return res.status(503).json({ error: "Banco de dados não configurado" });
  const where = user.role === "admin" ? eq(preAnalyses.id, req.params.id) : and(eq(preAnalyses.id, req.params.id), eq(preAnalyses.partnerId, user.id));
  const [item] = await db.update(preAnalyses).set({ status: parsed.data.status, updatedAt: new Date() }).where(where).returning();
  if (!item) return res.status(404).json({ error: "Pré-análise não encontrada" });
  return res.json({ item });
}));
