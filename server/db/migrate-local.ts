import { cp, mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { assertDatabaseSafety, environment } from "../environment";

assertDatabaseSafety();
if (environment.production) throw new Error("Este comando aceita somente bancos locais.");
const folder = path.resolve(".local", "migrations", environment.appEnv);
await mkdir(folder, { recursive: true });
await cp("drizzle/meta", path.join(folder, "meta"), { recursive: true });
for (const file of await readdir("drizzle")) {
  if (!file.endsWith(".sql")) continue;
  const original = await readFile(path.join("drizzle", file), "utf8");
  // Local PostgreSQL has no Supabase Storage. Keep versioned migrations intact.
  const local = original.replace(/INSERT INTO storage\.buckets[\s\S]*?;/g, "");
  await writeFile(path.join(folder, file), local);
}
const client = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1, onnotice: () => undefined });
try {
  await client`select pg_advisory_lock(7365, 2)`;
  const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8"));
  // Commit each historical migration before the next uses newly added enum values.
  for (let index = 0; index < journal.entries.length; index++) {
    await writeFile(path.join(folder, "meta", "_journal.json"), JSON.stringify({ ...journal, entries: journal.entries.slice(0, index + 1) }));
    await migrate(drizzle(client), { migrationsFolder: folder });
  }
  console.log(`Migrations locais concluídas: ${environment.appEnv.toUpperCase()}. Storage externo desabilitado.`);
} finally { await client.end(); }
