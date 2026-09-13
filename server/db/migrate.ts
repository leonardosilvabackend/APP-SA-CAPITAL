import postgres from "postgres";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { assertProductionMigration, environment, validateEnvironment, validateMigrationRole } from "../environment";

assertProductionMigration();
const url = process.env.SA_MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL!;
validateEnvironment({ ...process.env, DATABASE_URL: url }, true);
const migrationRole = validateMigrationRole(process.env, environment.production);
const client = postgres(url, { prepare: false, max: 1, onnotice: () => undefined });
try {
  if (migrationRole) {
    await client.unsafe(`set role "${migrationRole}"`);
    const [identity] = await client`select current_user`;
    if (identity.current_user !== migrationRole) throw new Error("Nao foi possivel assumir SA_MIGRATION_ROLE.");
  }
  await client`select pg_advisory_lock(7365, 2)`;
  const [migrationTable] = await client`select to_regclass('drizzle.__drizzle_migrations') is not null as available`;
  if (environment.production && !migrationTable.available) {
    throw new Error("Historico de migrations de producao nao encontrado.");
  }
  if (!migrationTable.available) {
    await client`create schema if not exists drizzle`;
    await client`create table drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)`;
  }
  const [last] = await client`select created_at from drizzle.__drizzle_migrations order by created_at desc limit 1`;
  const [storage] = await client`
    select exists (
      select 1 from information_schema.tables
      where table_schema = 'storage' and table_name = 'buckets'
    ) as available
  `;
  for (const migration of readMigrationFiles({ migrationsFolder: "drizzle" })) {
    if (last && Number(last.created_at) >= migration.folderMillis) continue;
    // Commit enum additions before a later migration uses the new values.
    await client.begin(async tx => {
      for (const statement of migration.sql) {
        // Storage provisioning is separate when this is a standalone PostgreSQL instance.
        const sql = storage.available ? statement : statement.replace(/INSERT INTO storage\.buckets[\s\S]*?;/g, "");
        if (sql.trim()) await tx.unsafe(sql);
      }
      await tx`insert into drizzle.__drizzle_migrations (hash, created_at) values (${migration.hash}, ${migration.folderMillis})`;
    });
  }
  console.log(`Migrations concluídas: ${environment.appEnv.toUpperCase()}.`);
} finally { await client.end(); }
