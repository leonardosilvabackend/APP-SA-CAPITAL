import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config";
import { authRouter } from "./auth/routes";
import { usersRouter } from "./users/routes";
import { stockRouter } from "./stock/routes";
import { quotesRouter } from "./quotes/routes";
import { dashboardRouter } from "./dashboard/routes";
import { preAnalysesRouter } from "./pre-analyses/routes";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));
app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/stock", stockRouter);
app.use("/api/quotes", quotesRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/pre-analyses", preAnalysesRouter);

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    app: "SA-CAPITAL-APP",
    timestamp: new Date().toISOString(),
    databaseConfigured: Boolean(config.databaseUrl),
  });
});

app.use("/api", (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[API] Erro não tratado", error);
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

app.listen(config.port, "0.0.0.0", () => {
  console.log(`SA Capital disponível em http://localhost:${config.port}`);
});
