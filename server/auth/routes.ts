import { and, count, eq, gt, isNull, sql } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import { changePasswordInputSchema, loginInputSchema, requestPasswordResetInputSchema, resetPasswordInputSchema, setupAdminInputSchema, type AuthenticatedUser } from "../../shared/contracts";
import { config } from "../config";
import { getDatabase } from "../db/client";
import { passwordResetTokens, users } from "../db/schema";
import { sendPasswordResetEmail } from "../email";
import { hashPassword, verifyPassword } from "./password";
import { getCurrentUser } from "./current-user";
import { clearSessionCookie, createSessionToken, setSessionCookie } from "./session";

export const authRouter = Router();
const attempts = new Map<string, { count: number; resetAt: number }>();

function asyncRoute(handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => { void handler(req, res, next).catch(next); };
}

function publicUser(user: typeof users.$inferSelect): AuthenticatedUser {
  return { id: user.id, name: user.name, email: user.email, role: user.role === "partner" ? "user" : user.role, managerId: user.managerId, status: user.status, mustChangePassword: user.mustChangePassword };
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

function hashResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
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
    const token = await createSessionToken(user.id, user.sessionVersion);
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
  const token = await createSessionToken(user.id, user.sessionVersion);
  setSessionCookie(res, token);
  return res.json({ user: publicUser(user) });
}));

authRouter.get("/me", asyncRoute(async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) {
    clearSessionCookie(res);
    return res.status(401).json({ user: null });
  }
  return res.json({ user: publicUser(user) });
}));

authRouter.post("/logout", (_req, res) => {
  clearSessionCookie(res);
  return res.json({ success: true });
});

authRouter.post("/forgot-password", asyncRoute(async (req, res) => {
  const parsed = requestPasswordResetInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "E-mail inválido" });
  const genericResponse = { message: "Se o e-mail estiver cadastrado, você receberá as instruções" };
  const db = getDatabase();
  if (!db) return res.status(503).json({ error: "Banco de dados não configurado" });
  const [user] = await db.select().from(users).where(eq(users.email, parsed.data.email)).limit(1);
  if (!user || user.status !== "active") return res.json(genericResponse);

  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = hashResetToken(rawToken);
  const expiresAt = new Date(Date.now() + 60 * 60_000);
  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id));
  const [created] = await db.insert(passwordResetTokens).values({ userId: user.id, tokenHash, expiresAt }).returning();
  const resetUrl = new URL("/reset-password", config.appUrl);
  resetUrl.searchParams.set("token", rawToken);
  try {
    await sendPasswordResetEmail(user.name, user.email, resetUrl.toString());
  } catch (error) {
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.id, created.id));
    console.error("[Auth] Falha ao enviar recuperação de senha", error);
  }
  return res.json(genericResponse);
}));

authRouter.get("/reset-password/validate", asyncRoute(async (req, res) => {
  const token = typeof req.query.token === "string" ? req.query.token : "";
  if (token.length < 40) return res.status(400).json({ valid: false });
  const db = getDatabase();
  if (!db) return res.status(503).json({ error: "Banco de dados não configurado" });
  const [record] = await db.select({ id: passwordResetTokens.id }).from(passwordResetTokens).where(and(
    eq(passwordResetTokens.tokenHash, hashResetToken(token)),
    isNull(passwordResetTokens.usedAt),
    gt(passwordResetTokens.expiresAt, new Date()),
  )).limit(1);
  return res.json({ valid: Boolean(record) });
}));

authRouter.post("/reset-password", asyncRoute(async (req, res) => {
  const parsed = resetPasswordInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" });
  const db = getDatabase();
  if (!db) return res.status(503).json({ error: "Banco de dados não configurado" });
  const newHash = await hashPassword(parsed.data.password);
  const updatedUser = await db.transaction(async tx => {
    const [claimed] = await tx.update(passwordResetTokens).set({ usedAt: new Date() }).where(and(
      eq(passwordResetTokens.tokenHash, hashResetToken(parsed.data.token)),
      isNull(passwordResetTokens.usedAt),
      gt(passwordResetTokens.expiresAt, new Date()),
    )).returning();
    if (!claimed) return null;
    const [user] = await tx.update(users).set({ passwordHash: newHash, mustChangePassword: false, sessionVersion: sql`${users.sessionVersion} + 1`, updatedAt: new Date() }).where(eq(users.id, claimed.userId)).returning();
    return user ?? null;
  });
  if (!updatedUser) return res.status(400).json({ error: "Este link é inválido, expirou ou já foi utilizado" });
  clearSessionCookie(res);
  return res.json({ success: true });
}));

authRouter.post("/change-password", asyncRoute(async (req, res) => {
  const current = await getCurrentUser(req);
  if (!current) return res.status(401).json({ error: "Faça login para continuar" });
  const parsed = changePasswordInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" });
  if (!(await verifyPassword(parsed.data.currentPassword, current.passwordHash))) return res.status(400).json({ error: "A senha atual não confere" });
  const db = getDatabase();
  if (!db) return res.status(503).json({ error: "Banco de dados não configurado" });
  const passwordHash = await hashPassword(parsed.data.newPassword);
  const [updated] = await db.update(users).set({ passwordHash, mustChangePassword: false, sessionVersion: sql`${users.sessionVersion} + 1`, updatedAt: new Date() }).where(eq(users.id, current.id)).returning();
  const token = await createSessionToken(updated.id, updated.sessionVersion);
  setSessionCookie(res, token);
  return res.json({ user: publicUser(updated) });
}));
