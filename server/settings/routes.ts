import { eq } from "drizzle-orm";
import { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import { z } from "zod";
import { defaultIncomeDocuments, legalNotice } from "../../shared/business";
import { incomeCatalog, incomeDocumentsSchema, incomeTypesSchema } from "../../shared/income-catalog";
import { getCurrentUser } from "../auth/current-user";
import { getDatabase } from "../db/client";
import { appSettings } from "../db/schema";

export const settingsRouter = Router();
function asyncRoute(handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => { void handler(req, res, next).catch(next); };
}
async function ensureSettings() {
  const db = getDatabase()!;
  let [item] = await db.select().from(appSettings).where(eq(appSettings.id, "default"));
  if (!item) {
    await db.insert(appSettings).values({ id: "default", incomeDocuments: defaultIncomeDocuments, legalNotice }).onConflictDoNothing();
    [item] = await db.select().from(appSettings).where(eq(appSettings.id, "default"));
  }
  return item;
}
const settingsInput = z.object({
  updatedAt: z.string().datetime(),
  companyName: z.string().min(2).max(160),
  companyEmail: z.string().email().or(z.literal("")),
  companyPhone: z.string().max(40),
  legalNotice: z.string().min(20).max(3000),
  maxFileSizeMb: z.number().int().min(1).max(25),
  allowedFileTypes: z.array(z.enum(["application/pdf", "image/jpeg", "image/png"])).min(1),
  incomeDocuments: incomeDocumentsSchema,
  incomeTypes: incomeTypesSchema,
}).refine(v => !v.incomeTypes || Object.keys(v.incomeTypes).every(name => Object.hasOwn(v.incomeDocuments, name)), "Classificação de renda inválida");

settingsRouter.get("/", asyncRoute(async (req, res) => {
  if (!(await getCurrentUser(req))) return res.status(401).json({ error: "Faça login" });
  if (!getDatabase()) return res.status(503).json({ error: "Banco não configurado" });
  return res.json({ settings: await ensureSettings() });
}));
settingsRouter.put("/", asyncRoute(async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user || user.role !== "admin") return res.status(403).json({ error: "Apenas o administrador altera configurações" });
  const parsed = settingsInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" });
  const db = getDatabase();
  if (!db) return res.status(503).json({ error: "Banco não configurado" });
  const { updatedAt: version, ...values } = parsed.data;
  const settings = await db.transaction(async tx => {
    const [current] = await tx.select().from(appSettings).where(eq(appSettings.id, "default")).for("update");
    if (!current || current.updatedAt.toISOString() !== version) return null;
    const [saved] = await tx.update(appSettings).set({
      ...values,
      incomeTypes: Object.fromEntries(incomeCatalog(values).map(t => [t.name, t.customerType])),
      companyEmail: values.companyEmail || null,
      updatedAt: new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1)),
    }).where(eq(appSettings.id, "default")).returning();
    return saved;
  });
  if (!settings) return res.status(409).json({ error: "As configurações foram alteradas por outra sessão. Recarregue a página antes de editar novamente." });
  return res.json({ settings });
}));
