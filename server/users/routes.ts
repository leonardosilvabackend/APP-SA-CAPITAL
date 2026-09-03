import { asc, eq } from "drizzle-orm";
import { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import { createUserInputSchema, updateUserInputSchema } from "../../shared/contracts";
import { getCurrentUser } from "../auth/current-user";
import { hashPassword } from "../auth/password";
import { getDatabase } from "../db/client";
import { users } from "../db/schema";

export const usersRouter = Router();

function asyncRoute(handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => { void handler(req, res, next).catch(next); };
}

function publicUser(user: typeof users.$inferSelect) {
  const { passwordHash: _passwordHash, ...safe } = user;
  return safe;
}

async function requireAdmin(req: Request, res: Response) {
  const current = await getCurrentUser(req);
  if (!current) {
    res.status(401).json({ error: "Faça login para continuar" });
    return null;
  }
  if (current.role !== "admin") {
    res.status(403).json({ error: "Acesso exclusivo para administradores" });
    return null;
  }
  return current;
}

usersRouter.get("/", asyncRoute(async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const db = getDatabase();
  if (!db) return res.status(503).json({ error: "Banco de dados não configurado" });
  const result = await db.select().from(users).orderBy(asc(users.name));
  return res.json({ users: result.map(publicUser) });
}));

usersRouter.post("/", asyncRoute(async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const parsed = createUserInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" });
  const db = getDatabase();
  if (!db) return res.status(503).json({ error: "Banco de dados não configurado" });

  try {
    const passwordHash = await hashPassword(parsed.data.password);
    const [created] = await db.insert(users).values({
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone || null,
      passwordHash,
      role: parsed.data.role,
      status: "active",
      mustChangePassword: true,
    }).returning();
    return res.status(201).json({ user: publicUser(created) });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "23505") return res.status(409).json({ error: "Este e-mail já está cadastrado" });
    throw error;
  }
}));

usersRouter.patch("/:id", asyncRoute(async (req, res) => {
  const current = await requireAdmin(req, res);
  if (!current) return;
  const parsed = updateUserInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" });
  if (current.id === req.params.id && (parsed.data.role || parsed.data.status)) return res.status(400).json({ error: "Você não pode alterar seu próprio perfil ou situação" });
  const db = getDatabase();
  if (!db) return res.status(503).json({ error: "Banco de dados não configurado" });

  const [updated] = await db.update(users).set({ ...parsed.data, updatedAt: new Date() }).where(eq(users.id, req.params.id)).returning();
  if (!updated) return res.status(404).json({ error: "Usuário não encontrado" });
  return res.json({ user: publicUser(updated) });
}));
