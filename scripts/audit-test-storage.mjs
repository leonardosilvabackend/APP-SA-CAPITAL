import { mkdir, readFile, writeFile } from "node:fs/promises";
import { parse } from "dotenv";
import { createClient } from "@supabase/supabase-js";

const configurationFile = ".env.storage-audit";
const settings = parse(await readFile(configurationFile, "utf8"));
const required = [
  "APP_ENV", "TEST_SUPABASE_PROJECT_REF", "PRODUCTION_SUPABASE_PROJECT_REF",
  "TEST_SUPABASE_URL", "TEST_SUPABASE_SERVICE_ROLE_KEY", "TEST_STORAGE_BUCKET",
  "CONFIRM_TEST_STORAGE_AUDIT",
];
for (const key of required) if (!settings[key]) throw new Error(`Configure ${key} em ${configurationFile}`);
if (settings.APP_ENV !== "test") throw new Error("Auditoria permitida somente em TEST");
if (settings.CONFIRM_TEST_STORAGE_AUDIT !== "only-isolated-test-storage") throw new Error("Confirmação do Storage TEST ausente");
if (settings.TEST_SUPABASE_PROJECT_REF === settings.PRODUCTION_SUPABASE_PROJECT_REF) throw new Error("Projeto TEST não pode ser igual à produção");
if (!/^[a-z0-9]{20}$/.test(settings.TEST_SUPABASE_PROJECT_REF) || !/^[a-z0-9]{20}$/.test(settings.PRODUCTION_SUPABASE_PROJECT_REF)) throw new Error("Project refs inválidos");
if (!/^[a-z0-9-]+$/.test(settings.TEST_STORAGE_BUCKET)) throw new Error("Bucket TEST inválido");
const url = new URL(settings.TEST_SUPABASE_URL);
if (url.protocol !== "https:" || url.hostname !== `${settings.TEST_SUPABASE_PROJECT_REF}.supabase.co` || url.pathname !== "/" || url.search || url.hash || url.username || url.password) throw new Error("URL não corresponde ao projeto TEST confirmado");

const client = createClient(url.href, settings.TEST_SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15_000) }) },
});
const bucketInfo = await client.storage.getBucket(settings.TEST_STORAGE_BUCKET);
if (bucketInfo.error) throw new Error(`Bucket TEST indisponível: ${bucketInfo.error.message}`);
const bucket = client.storage.from(settings.TEST_STORAGE_BUCKET);
const objects = [];

async function walk(prefix = "") {
  for (let offset = 0; ; offset += 1000) {
    const page = await bucket.list(prefix, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
    if (page.error) throw new Error(`Falha ao listar ${prefix || "/"}: ${page.error.message}`);
    for (const item of page.data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) await walk(path);
      else objects.push({ path, size: Number(item.metadata?.size ?? 0), mimeType: item.metadata?.mimetype ?? null, createdAt: item.created_at, updatedAt: item.updated_at });
    }
    if (page.data.length < 1000) break;
  }
}

await walk();
const groups = {};
for (const item of objects) {
  const root = item.path.split("/", 1)[0] || "(root)";
  const group = groups[root] ??= { root, objects: 0, bytes: 0 };
  group.objects += 1; group.bytes += item.size;
}
const totalBytes = objects.reduce((sum, item) => sum + item.size, 0);
const report = {
  generatedAt: new Date().toISOString(), projectRef: settings.TEST_SUPABASE_PROJECT_REF,
  bucket: settings.TEST_STORAGE_BUCKET, public: Boolean(bucketInfo.data.public),
  totals: { objects: objects.length, bytes: totalBytes },
  byRoot: Object.values(groups).sort((a, b) => b.bytes - a.bytes),
  largestObjects: [...objects].sort((a, b) => b.size - a.size).slice(0, 100), objects,
};
await mkdir("artifacts/storage-audit", { recursive: true });
const output = `artifacts/storage-audit/test-storage-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
await writeFile(output, JSON.stringify(report, null, 2), "utf8");
console.log(`Auditoria TEST concluída: ${objects.length} objetos, ${(totalBytes / 1024 / 1024).toFixed(2)} MB. Relatório: ${output}`);
