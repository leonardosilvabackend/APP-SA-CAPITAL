import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    app: "SA-CAPITAL-APP",
    timestamp: new Date().toISOString(),
    databaseConfigured: Boolean(config.databaseUrl),
  });
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
