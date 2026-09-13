import { environment } from "./environment";

export const config = {
  trustProxyHops: Number(process.env.TRUST_PROXY_HOPS ?? 0),
  port: Number(process.env.PORT ?? 3000),
  appEnv: environment.appEnv,
  databaseEnv: process.env.DATABASE_ENV ?? "não configurado",
  emailEnabled: environment.production && process.env.EMAIL_ENABLED !== "false",
  scheduledJobsEnabled: process.env.ENABLE_SCHEDULED_JOBS === "true",
  fbSyncScheduleEnabled: process.env.FB_SYNC_SCHEDULE_ENABLED === "true",
  fbSyncIntervalMinutes: Number(process.env.FB_SYNC_INTERVAL_MINUTES ?? 30),
  fbSyncEnabled: process.env.FB_SYNC_ENABLED === "true",
  isProduction: process.env.NODE_ENV === "production",
  databaseUrl: process.env.DATABASE_URL ?? "",
  jwtSecret: process.env.JWT_SECRET ?? "",
  appUrl: process.env.APP_URL ?? "http://localhost:3000",
  supabaseUrl: environment.production ? process.env.SUPABASE_URL ?? "" : "",
  supabaseServiceRoleKey: environment.production ? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "" : "",
  storageBucket: process.env.SUPABASE_BUCKET ?? process.env.SUPABASE_STORAGE_BUCKET ?? "documents",
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  resendFromEmail: process.env.RESEND_FROM_EMAIL ?? "",
};
