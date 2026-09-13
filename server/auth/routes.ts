import { guardAuthRate } from "./rate-limit";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import { changePasswordInputSchema, loginInputSchema, requestPasswordResetInputSchema, resetPasswordInputSchema, type AuthenticatedUser } from "../../shared/contracts";
import { config } from "../config";
import { getDatabase } from "../db/client";
import { passwordResetTokens, users } from "../db/schema";
import { sendPasswordResetEmail } from "../email";
import { hashPassword, verifyPassword } from "./password";
import { getCurrentUser } from "./current-user";
import { clearSessionCookie, createSessionToken, setSessionCookie } from "./session";

export const authRouter = Router();
function asyncRoute(handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => { void handler(req, res, next).catch(next); };
}

function publicUser(user: typeof users.$inferSelect): AuthenticatedUser {
  return { id: user.id, name: user.name, email: user.email, role: user.role === "partner" ? "user" : user.role, managerId: user.managerId, status: user.status, mustChangePassword: user.mustChangePassword };
}

function hashResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

// Initial administrators are provisioned by the restricted bootstrap command only.
authRouter.get("/setup-status", (_req, res) => res.json({ needsSetup: false }));
authRouter.post("/setup-admin", (_req, res) => res.status(403).json({ error: "O cadastro inicial deve ser feito pelo operador do sistema." }));

authRouter.post("/login", asyncRoute(async (req, res) => {
  if (!await guardAuthRate(req, res, "login")) return;
  const parsed = loginInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" });
  const db = getDatabase();
  if (!db) return res.status(503).json({ error: "Banco de dados não configurado" });

  const [user] = await db.select().from(users).where(eq(users.email, parsed.data.email)).limit(1);
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) return res.status(401).json({ error: "E-mail ou senha inválidos" });
  if (user.status !== "active") return res.status(403).json({ error: "Usuário inativo. Fale com um administrador" });
  const token = await createSessionToken(user.id, user.sessionVersion);
  setSessionCookie(res, token);
  return res.json({ user: publicUser(user) });
}));

authRouter.get("/me", asyncRoute(async (req, res) => {
  const user = await getCurrentUser(req, { allowPasswordChange: true });
  if (!user) {
    clearSessionCookie(res);
    return res.status(401).json({ user: null });
  }
  return res.json({ user: publicUser(user) });
}));

authRouter.post("/logout", asyncRoute(async (req, res) => {
  const current = await getCurrentUser(req, { allowPasswordChange: true });
  if (current) await getDatabase()!.update(users).set({ sessionVersion: sql`${users.sessionVersion} + 1` }).where(eq(users.id, current.id));
  clearSessionCookie(res);
  return res.json({ success: true });
}));

authRouter.post("/forgot-password", asyncRoute(async (req, res) => {
  if (!await guardAuthRate(req, res, "forgot-password", 3)) return;
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
  const created = await db.transaction(async tx => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, user.id)).for("update");
    await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id));
    return (await tx.insert(passwordResetTokens).values({ userId: user.id, tokenHash, expiresAt }).returning())[0];
  });
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
  if (!await guardAuthRate(req, res, "validate-reset")) return;
  const token = typeof req.query.token === "string" ? req.query.token : "";
  if (token.length < 40 || token.length > 200) return res.status(400).json({ valid: false });
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
  if (!await guardAuthRate(req, res, "reset-password", 10)) return;
  const parsed = resetPasswordInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" });
  const db = getDatabase();
  if (!db) return res.status(503).json({ error: "Banco de dados não configurado" });
  const [candidate] = await db.select({ id: passwordResetTokens.id, userId: passwordResetTokens.userId }).from(passwordResetTokens).where(and(
    eq(passwordResetTokens.tokenHash, hashResetToken(parsed.data.token)), isNull(passwordResetTokens.usedAt), gt(passwordResetTokens.expiresAt, new Date())
  )).limit(1);
  if (!candidate) return res.status(400).json({ error: "Link invalido, expirado ou utilizado." });
  const newHash = await hashPassword(parsed.data.password);
  const updatedUser = await db.transaction(async tx => {
    const [owner] = await tx.select({ id: users.id, status: users.status }).from(users).where(eq(users.id, candidate.userId)).for("update");
    if (!owner || owner.status !== "active") return null;
    const [claimed] = await tx.update(passwordResetTokens).set({ usedAt: new Date() }).where(and(
      eq(passwordResetTokens.tokenHash, hashResetToken(parsed.data.token)),
      isNull(passwordResetTokens.usedAt),
      gt(passwordResetTokens.expiresAt, new Date()),
    )).returning();
    if (!claimed) return null;
    const [user] = await tx.update(users).set({ passwordHash: newHash, mustChangePassword: false, sessionVersion: sql`${users.sessionVersion} + 1`, updatedAt: new Date() }).where(eq(users.id, claimed.userId)).returning();
    if (user) await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id));
    return user ?? null;
  });
  if (!updatedUser) return res.status(400).json({ error: "Este link é inválido, expirou ou já foi utilizado" });
  clearSessionCookie(res);
  return res.json({ success: true });
}));

authRouter.post("/change-password", asyncRoute(async (req, res) => {
  if (!await guardAuthRate(req, res, "change-password", 10)) return;
  const current = await getCurrentUser(req, { allowPasswordChange: true });
  if (!current) return res.status(401).json({ error: "Faça login para continuar" });
  const parsed = changePasswordInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" });
  if (!(await verifyPassword(parsed.data.currentPassword, current.passwordHash))) return res.status(400).json({ error: "A senha atual não confere" });
  const db = getDatabase();
  if (!db) return res.status(503).json({ error: "Banco de dados não configurado" });
  const passwordHash = await hashPassword(parsed.data.newPassword);
  const updated = await db.transaction(async tx => {
    const [locked] = await tx.select().from(users).where(eq(users.id, current.id)).for("update");
    if (!locked || locked.sessionVersion !== current.sessionVersion) return null;
    const [changed] = await tx.update(users).set({ passwordHash, mustChangePassword: false, sessionVersion: sql`${users.sessionVersion} + 1`, updatedAt: new Date() }).where(eq(users.id, current.id)).returning();
    await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, current.id));
    return changed;
  });
  if (!updated) return res.status(409).json({ error: "Sua sessao mudou. Entre novamente." });
  const token = await createSessionToken(updated.id, updated.sessionVersion);
  setSessionCookie(res, token);
  return res.json({ user: publicUser(updated) });
}));
