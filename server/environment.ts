import { config as loadDotenv } from "dotenv";

type Env = Record<string, string | undefined>;
const environments = ["development", "test", "staging", "production"];

export function validateEnvironment(env: Env, requireDatabase = false) {
  const appEnv = env.APP_ENV ?? "development";
  if (!environments.includes(appEnv)) throw new Error("APP_ENV inválido.");
  const production = appEnv === "production";
  if (production !== (env.NODE_ENV === "production")) throw new Error("APP_ENV e NODE_ENV incompatíveis.");
  if (production && (!env.RAILWAY_ENVIRONMENT_ID || !env.RAILWAY_SERVICE_ID || !env.RAILWAY_DEPLOYMENT_ID)) {
    throw new Error("Produção permitida somente no deploy Railway; execução local bloqueada.");
  }
  if (env.DATABASE_ENV && env.DATABASE_ENV !== appEnv) throw new Error("APP_ENV e DATABASE_ENV incompatíveis. Conexão bloqueada.");
  if (env.DATABASE_URL || requireDatabase) {
    if (!env.DATABASE_URL) throw new Error(`DATABASE_URL de ${appEnv} não configurada. Configure um banco de desenvolvimento/teste antes de iniciar o servidor.`);
    if (env.DATABASE_ENV !== appEnv) throw new Error("Configure DATABASE_ENV igual a APP_ENV.");
    let url: URL;
    try { url = new URL(env.DATABASE_URL); } catch { throw new Error("DATABASE_URL inválida."); }
    if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("DATABASE_URL deve usar PostgreSQL.");
    if (!production) {
      // Literal loopback only: remote hosts, DNS aliases and URL overrides are refused.
      if (!["127.0.0.1", "[::1]"].includes(url.hostname) || url.search || url.hash || url.pathname !== `/sa_capital_${appEnv}`) {
        throw new Error("Banco remoto/produção bloqueado. Use PostgreSQL local (127.0.0.1), banco sa_capital_" + appEnv + ", sem parâmetros na URL.");
      }
    }
  }
  for (const key of ["EMAIL_ENABLED", "ENABLE_SCHEDULED_JOBS", "FB_SYNC_ENABLED", "FB_SYNC_SCHEDULE_ENABLED"]) {
    if (env[key] !== undefined && !["true", "false"].includes(env[key]!)) throw new Error(`${key} deve ser true ou false.`);
  }
  if (env.FB_SYNC_INTERVAL_MINUTES !== undefined && (!/^\d+$/.test(env.FB_SYNC_INTERVAL_MINUTES) || Number(env.FB_SYNC_INTERVAL_MINUTES) < 1 || Number(env.FB_SYNC_INTERVAL_MINUTES) > 1440)) throw new Error("FB_SYNC_INTERVAL_MINUTES deve estar entre 1 e 1440.");
  if (env.TRUST_PROXY_HOPS !== undefined && !["0", "1", "2"].includes(env.TRUST_PROXY_HOPS)) throw new Error("TRUST_PROXY_HOPS invalido");
  return { appEnv, production };
}

// Never read .env or .env.production, and never inherit local service credentials.
const selected = process.env.APP_ENV ?? (process.env.NODE_ENV === "test" ? "test" : "development");
if (!environments.includes(selected)) throw new Error("APP_ENV inválido.");
if (selected !== "production") {
  const local: Env = {};
  loadDotenv({ path: `.env.${selected}`, processEnv: local, quiet: true });
  if (local.APP_ENV && local.APP_ENV !== selected) throw new Error("APP_ENV incompatível com o ambiente solicitado.");
  if (local.NODE_ENV && local.NODE_ENV !== (selected === "test" ? "test" : "development")) throw new Error("NODE_ENV incompatível no arquivo local.");
  const keys = ["DATABASE_URL", "DATABASE_ENV", "JWT_SECRET", "APP_URL", "PORT", "SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_BUCKET", "SUPABASE_STORAGE_BUCKET", "RESEND_API_KEY", "RESEND_FROM_EMAIL", "EMAIL_ENABLED", "ENABLE_SCHEDULED_JOBS", "FB_SYNC_ENABLED", "FB_SYNC_SCHEDULE_ENABLED"];
  keys.push("FB_SYNC_INTERVAL_MINUTES", "TRUST_PROXY_HOPS");
  for (const key of keys) {
    delete process.env[key];
    if (local[key] !== undefined) process.env[key] = local[key];
  }
  process.env.APP_ENV = selected;
}
export const environment = validateEnvironment(process.env);

export function assertDatabaseSafety() { validateEnvironment(process.env, true); }
export function assertProductionMigration() {
  assertDatabaseSafety();
  if (environment.production && process.env.CONFIRM_PRODUCTION_MIGRATIONS !== "apply-production-migrations") {
    throw new Error("Migration de produção exige CONFIRM_PRODUCTION_MIGRATIONS=apply-production-migrations no Railway.");
  }
}
