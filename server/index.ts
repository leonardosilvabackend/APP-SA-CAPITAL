import { observeRequest, operationalMetrics, readinessProbe } from "./observability";
import { sql } from "drizzle-orm";
import { getDatabase } from "./db/client";
import { processEmailJobs } from "./email-queue";
import { processStorageCleanup } from "./files/cleanup";
import { FileValidationError } from "./files/validation";
import { getCurrentUser, PasswordChangeRequiredError } from "./auth/current-user";
import { startFbScheduler } from "./stock/fb-scheduler";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config";
import { assertDatabaseSafety } from "./environment";
import { authRouter } from "./auth/routes";
import { usersRouter } from "./users/routes";
import { stockRouter } from "./stock/routes";
import { cleanupExpiredQuotes, quotesRouter } from "./quotes/routes";
import { dashboardRouter } from "./dashboard/routes";
import { cleanupExpiredDocuments, preAnalysesRouter } from "./pre-analyses/routes";
import { settingsRouter } from "./settings/routes";
import { administratorsRouter } from "./administrators/routes";
import { negotiationsRouter } from "./negotiations/routes";
import { backfillNegotiations } from "./negotiations/service";
import { cleanupExpiredNotifications, notificationsRouter } from "./notifications/routes";
import { auditRouter } from "./audit/routes";

assertDatabaseSafety();
if (config.jwtSecret.length < 32) throw new Error("JWT_SECRET deve possuir ao menos 32 caracteres");
if (config.isProduction && new URL(config.appUrl).protocol !== "https:") throw new Error("APP_URL de producao exige HTTPS");
if (config.emailEnabled && (!config.resendApiKey || !config.resendFromEmail)) throw new Error("Servico de email habilitado sem credenciais");
console.log(`SA Capital\nAmbiente: ${config.appEnv.toUpperCase()}\nBanco: ${config.databaseEnv.toUpperCase()}\nE-mails: ${config.emailEnabled ? "HABILITADOS" : "DESABILITADOS"}\nJobs automáticos: ${config.scheduledJobsEnabled ? "HABILITADOS" : "DESABILITADOS"}\nSincronização FB: ${config.fbSyncEnabled ? "HABILITADA" : "DESABILITADA"}`);
const app = express();
app.disable("x-powered-by");
app.use("/api", observeRequest);
app.set("trust proxy", config.trustProxyHops);
app.use("/api/administrators", administratorsRouter);
app.use("/api/negotiations", negotiationsRouter);
app.use("/api/stock", stockRouter);
app.use(express.json({ limit: "2mb" }));
app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/quotes", quotesRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/pre-analyses", preAnalysesRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/audit", auditRouter);

const checkReady = readinessProbe(async () => {
  await getDatabase()!.execute(sql`select (select count(*) from auth_rate_limits where false), (select count(*) from email_jobs where false), (select count(*) from notifications where false)`);
});
app.get("/api/ready", async (_req, res) => {
  try { await checkReady(); res.json({ status: "ready", environment: config.appEnv }); }
  catch { res.status(503).json({ status: "unavailable" }); }
});
app.get("/api/operations", (req, res, next) => {
  void getCurrentUser(req).then(user => {
    if (!user || user.role !== "admin") { res.status(user ? 403 : 401).json({ error: "Acesso restrito" }); return; }
    res.setHeader("Cache-Control", "no-store"); res.json(operationalMetrics());
  }).catch(next);
});

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    app: "SA-CAPITAL-APP",
    timestamp: new Date().toISOString(),
    databaseConfigured: Boolean(config.databaseUrl),
    environment: config.appEnv,
    databaseEnvironment: config.databaseEnv,
    emailEnabled: config.emailEnabled,
    scheduledJobsEnabled: config.scheduledJobsEnabled,
  });
});

app.use("/api", (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = (error as { status?: number })?.status;
  if (status === 413 || status === 400) { res.status(status).json({ error: status === 413 ? "Solicitacao acima do limite permitido" : "Solicitacao invalida" }); return; }
  if (error instanceof PasswordChangeRequiredError) { res.status(403).json({ error: error.message, code: error.code }); return; }
  if (error instanceof FileValidationError) { res.status(400).json({ error: error.message }); return; }
  console.error(JSON.stringify({ event: "api_error", requestId: res.getHeader("X-Request-Id"), type: error instanceof Error ? error.name : "UnknownError" }));
  res.status(500).json({ error: "Erro interno do servidor" });
});

if (config.isProduction) {
  const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "public");
  app.use(express.static(publicDir));
  app.get("*", (_req, res) => res.sendFile(path.join(publicDir, "index.html")));
} else {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
  app.use(vite.middlewares);
}

app.listen(config.port, config.isProduction ? "0.0.0.0" : "127.0.0.1", () => {
  console.log(`SA Capital disponível em http://localhost:${config.port}`);
});

const maintenance = () => Promise.all([cleanupExpiredQuotes(), cleanupExpiredDocuments(), cleanupExpiredNotifications(), processStorageCleanup()]).catch(error => console.error("[Manutenção] Falha na limpeza automática", error));
if (config.scheduledJobsEnabled) {
  void backfillNegotiations().then(maintenance).catch(error => console.error("[Negociações] Falha ao importar reservas anteriores", error));
  setInterval(() => void processEmailJobs().catch(() => console.error("[Email] Falha no processamento da fila")), 60_000).unref();
  setInterval(() => void maintenance(), 60 * 60 * 1000).unref();
}

startFbScheduler();
