import { count, eq, sql } from "drizzle-orm";
import { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import { loginInputSchema, setupAdminInputSchema, type AuthenticatedUser } from "../../shared/contracts";
import { getDatabase } from "../db/client";
import { users } from "../db/schema";
import { hashPassword, verifyPassword } from "./password";
import { clearSessionCookie, createSessionToken, getSessionToken, readSessionToken, setSessionCookie } from "./session";

export const authRouter = Router();
const attempts = new Map<string, { count: number; resetAt: number }>();

function asyncRoute(handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => { void handler(req, res, next).catch(next); };
}

function publicUser(user: typeof users.$inferSelect): AuthenticatedUser {
  return { id: user.id, name: user.name, email: user.email, role: user.role, status: user.status };
}

function requestKey(req: Request) {
  return req.ip || req.socket.remoteAddress || "unknown";
}

function isRateLimited(req: Request) {
  const key = requestKey(req);
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + 15 * 60_000 });
    return false;
  }
  entry.count += 1;
  return entry.count > 10;
}

function clearAttempts(req: Request) {
  attempts.delete(requestKey(req));
}

authRouter.get("/setup-status", asyncRoute(async (_req, res) => {
  const db = getDatabase();
  if (!db) return res.status(503).json({ error: "Banco de dados não configurado" });
  const [result] = await db.select({ value: count() }).from(users);
  return res.json({ needsSetup: (result?.value ?? 0) === 0 });
}));

authRouter.post("/setup-admin", asyncRoute(async (req, res) => {
  const parsed = setupAdminInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" });
  const db = getDatabase();
  if (!db) return res.status(503).json({ error: "Banco de dados não configurado" });

  try {
    const user = await db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(73622481)`);
      const [existing] = await tx.select({ value: count() }).from(users);
      if ((existing?.value ?? 0) > 0) throw new Error("SETUP_ALREADY_COMPLETED");
      const passwordHash = await hashPassword(parsed.data.password);
      const [created] = await tx.insert(users).values({
        name: parsed.data.name,
        email: parsed.data.email,
        passwordHash,
        role: "admin",
        status: "active",
      }).returning();
      return created;
    });
    const token = await createSessionToken(user.id);
    setSessionCookie(res, token);
    return res.status(201).json({ user: publicUser(user) });
  } catch (error) {
    if (error instanceof Error && error.message === "SETUP_ALREADY_COMPLETED") return res.status(409).json({ error: "O administrador inicial já foi criado" });
    console.error("[Auth] Falha ao criar administrador inicial", error);
    return res.status(500).json({ error: "Não foi possível criar o administrador" });
  }
}));

authRouter.post("/login", asyncRoute(async (req, res) => {
  if (isRateLimited(req)) return res.status(429).json({ error: "Muitas tentativas. Aguarde alguns minutos" });
  const parsed = loginInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" });
  const db = getDatabase();
  if (!db) return res.status(503).json({ error: "Banco de dados não configurado" });

  const [user] = await db.select().from(users).where(eq(users.email, parsed.data.email)).limit(1);
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) return res.status(401).json({ error: "E-mail ou senha inválidos" });
  if (user.status !== "active") return res.status(403).json({ error: "Usuário inativo. Fale com um administrador" });
  clearAttempts(req);
  const token = await createSessionToken(user.id);
  setSessionCookie(res, token);
  return res.json({ user: publicUser(user) });
}));

authRouter.get("/me", asyncRoute(async (req, res) => {
  const token = getSessionToken(req);
  if (!token) return res.status(401).json({ user: null });
  const userId = await readSessionToken(token);
  if (!userId) {
    clearSessionCookie(res);
    return res.status(401).json({ user: null });
  }
  const db = getDatabase();
  if (!db) return res.status(503).json({ error: "Banco de dados não configurado" });
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.status !== "active") {
    clearSessionCookie(res);
    return res.status(401).json({ user: null });
  }
  return res.json({ user: publicUser(user) });
}));

authRouter.post("/logout", (_req, res) => {
  clearSessionCookie(res);
  return res.json({ success: true });
});
