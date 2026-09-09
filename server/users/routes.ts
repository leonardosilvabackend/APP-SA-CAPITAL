import { and, asc, eq, or, sql } from "drizzle-orm";
import { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import { z } from "zod";
import { createUserInputSchema, updateUserInputSchema } from "../../shared/contracts";
import { getCurrentUser } from "../auth/current-user";
import { hashPassword } from "../auth/password";
import { getDatabase } from "../db/client";
import { users } from "../db/schema";

export const usersRouter = Router();
function asyncRoute(handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler { return (req, res, next) => { void handler(req, res, next).catch(next); }; }
function publicUser(user: typeof users.$inferSelect) { const { passwordHash: _passwordHash, sessionVersion: _sessionVersion, ...safe } = user; return safe; }
async function manager(req: Request, res: Response) { const current = await getCurrentUser(req); if (!current) { res.status(401).json({ error: "Faça login para continuar" }); return null; } if (!['admin', 'advisor'].includes(current.role)) { res.status(403).json({ error: "Você não tem permissão para gerenciar usuários" }); return null; } return current; }

usersRouter.get("/", asyncRoute(async (req, res) => {
  const current = await manager(req, res); if (!current) return;
  const db = getDatabase(); if (!db) return res.status(503).json({ error: "Banco de dados não configurado" });
  const result = current.role === "admin" ? await db.select().from(users).orderBy(asc(users.name)) : await db.select().from(users).where(or(eq(users.id, current.id), eq(users.managerId, current.id))).orderBy(asc(users.name));
  return res.json({ users: result.map(publicUser) });
}));

usersRouter.post("/", asyncRoute(async (req, res) => {
  const current = await manager(req, res); if (!current) return;
  const parsed = createUserInputSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" });
  if (current.role === "advisor" && parsed.data.role !== "user") return res.status(403).json({ error: "Assessores podem cadastrar somente usuários" });
  const db = getDatabase(); if (!db) return res.status(503).json({ error: "Banco de dados não configurado" });
  let managerId = current.role === "advisor" ? current.id : parsed.data.managerId ?? null;
  if (parsed.data.role === "user" && managerId) { const [advisor] = await db.select({ id: users.id }).from(users).where(and(eq(users.id, managerId), eq(users.role, "advisor"))).limit(1); if (!advisor) return res.status(400).json({ error: "Selecione um assessor válido" }); }
  if (parsed.data.role !== "user") managerId = null;
  try { const passwordHash = await hashPassword(parsed.data.password); const [created] = await db.insert(users).values({ name: parsed.data.name, email: parsed.data.email, phone: parsed.data.phone || null, passwordHash, role: parsed.data.role, managerId, mustChangePassword: true }).returning(); return res.status(201).json({ user: publicUser(created) }); }
  catch (error) { if (typeof error === "object" && error && "code" in error && error.code === "23505") return res.status(409).json({ error: "Já existe um usuário com este e-mail" }); throw error; }
}));

usersRouter.patch("/:id", asyncRoute(async (req, res) => {
  const current = await manager(req, res); if (!current) return;
  if (current.role !== "admin") return res.status(403).json({ error: "Somente o administrador pode alterar acessos" });
  if (!z.string().uuid().safeParse(req.params.id).success) return res.status(400).json({ error: "Usuário inválido" });
  const parsed = updateUserInputSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" });
  if (current.id === req.params.id && (parsed.data.status === "inactive" || (parsed.data.role && parsed.data.role !== "admin"))) return res.status(400).json({ error: "Você não pode remover seu próprio acesso administrativo" });
  const db = getDatabase(); if (!db) return res.status(503).json({ error: "Banco de dados não configurado" });
  const [existing] = await db.select().from(users).where(eq(users.id, req.params.id)).limit(1);
  if (!existing) return res.status(404).json({ error: "Usuário não encontrado" });
  const role = parsed.data.role ?? existing.role;
  const managerId = role === "user" ? (parsed.data.managerId === undefined ? existing.managerId : parsed.data.managerId) : null;
  if (managerId) {
    const [advisor] = await db.select({ id: users.id }).from(users).where(and(eq(users.id, managerId), eq(users.role, "advisor"))).limit(1);
    if (!advisor || managerId === req.params.id) return res.status(400).json({ error: "Selecione um assessor válido" });
  }
  const changes = { ...parsed.data, managerId, updatedAt: new Date(), ...(parsed.data.status === "inactive" || parsed.data.role || parsed.data.email ? { sessionVersion: sql`${users.sessionVersion} + 1` } : {}) };
  try {
    const [updated] = await db.update(users).set(changes).where(eq(users.id, req.params.id)).returning();
    if (!updated) return res.status(404).json({ error: "Usuário não encontrado" });
    return res.json({ user: publicUser(updated) });
  } catch (error) {
    if (databaseErrorCode(error) === "23505") return res.status(409).json({ error: "Já existe um usuário com este e-mail" });
    throw error;
  }
}));

function databaseErrorCode(error: unknown): unknown {
  if (!error || typeof error !== "object") return undefined;
  if ("code" in error) return error.code;
  return "cause" in error ? databaseErrorCode(error.cause) : undefined;
}

usersRouter.delete("/:id", asyncRoute(async (req, res) => {
  const current = await manager(req, res); if (!current) return;
  if (current.role !== "admin") return res.status(403).json({ error: "Somente o administrador pode excluir usuários" });
  if (!z.string().uuid().safeParse(req.params.id).success) return res.status(400).json({ error: "Usuário inválido" });
  if (current.id === req.params.id) return res.status(400).json({ error: "Você não pode excluir seu próprio usuário" });
  const db = getDatabase(); if (!db) return res.status(503).json({ error: "Banco de dados não configurado" });
  try {
    const [deleted] = await db.delete(users).where(eq(users.id, req.params.id)).returning({ id: users.id });
    if (!deleted) return res.status(404).json({ error: "Usuário não encontrado" });
    return res.json({ success: true });
  } catch (error) {
    if (databaseErrorCode(error) === "23503") return res.status(409).json({ error: "Este usuário possui histórico vinculado e não pode ser excluído. Desative o acesso para preservar os registros." });
    throw error;
  }
}));
