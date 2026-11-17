import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "dotenv";
import postgres from "postgres";

const auditPath = process.argv[2];
if (!auditPath || !path.resolve(auditPath).startsWith(path.resolve("artifacts/storage-audit") + path.sep)) {
  throw new Error("Informe um relatório localizado em artifacts/storage-audit");
}
const audit = JSON.parse(await readFile(auditPath, "utf8"));
const settings = parse(await readFile(".env.test", "utf8"));
if (settings.APP_ENV !== "test" || settings.DATABASE_ENV !== "test" || !settings.DATABASE_URL) throw new Error("Banco TEST local não configurado");
const databaseUrl = new URL(settings.DATABASE_URL);
if (!["127.0.0.1", "[::1]"].includes(databaseUrl.hostname) || databaseUrl.pathname !== "/sa_capital_test" || databaseUrl.search || databaseUrl.hash) throw new Error("Análise aceita somente banco TEST local");

const sql = postgres(settings.DATABASE_URL, { max: 1, connect_timeout: 5, idle_timeout: 1 });
try {
  const [administrators, receipts, analyses, users, cleanup] = await Promise.all([
    sql`select logo, documents from administrators`,
    sql`select storage_path from negotiation_receipts`,
    sql`select storage_path from pre_analysis_documents`,
    sql`select id from users`,
    sql`select path from storage_cleanup`,
  ]);
  const referenced = new Set();
  for (const item of administrators) {
    if (item.logo?.storagePath) referenced.add(item.logo.storagePath);
    for (const document of item.documents ?? []) if (document.storagePath) referenced.add(document.storagePath);
  }
  for (const item of receipts) referenced.add(item.storage_path);
  for (const item of analyses) referenced.add(item.storage_path);
  const liveUsers = new Set(users.map(item => String(item.id)));
  const queued = new Set(cleanup.map(item => item.path));
  const knownRoots = new Set(["administrators", "negotiations", "pre-analyses", "profiles"]);
  const classified = audit.objects.map(item => {
    const parts = item.path.split("/");
    const profileIsLive = parts[0] === "profiles" && liveUsers.has(parts[1]) && parts[2] === "avatar";
    const state = queued.has(item.path) ? "queued_for_cleanup"
      : referenced.has(item.path) || profileIsLive ? "referenced"
      : knownRoots.has(parts[0]) ? "orphan_candidate"
      : "untracked_root";
    return { ...item, state };
  });
  const summary = classified.reduce((result, item) => {
    const value = result[item.state] ??= { objects: 0, bytes: 0 };
    value.objects += 1; value.bytes += item.size;
    return result;
  }, {});
  const report = { generatedAt: new Date().toISOString(), sourceAudit: auditPath, summary, objects: classified };
  await mkdir("artifacts/storage-audit", { recursive: true });
  const output = `artifacts/storage-audit/test-analysis-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  await writeFile(output, JSON.stringify(report, null, 2), "utf8");
  console.log(`Análise concluída. Candidatos nunca são removidos automaticamente. Relatório: ${output}`);
} finally {
  await sql.end({ timeout: 1 });
}
