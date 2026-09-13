import { spawnSync } from 'node:child_process';
const [mode, command] = process.argv.slice(2);
if (!['development', 'test', 'production'].includes(mode)) throw new Error('Ambiente inválido');
process.env.APP_ENV = mode;
process.env.NODE_ENV = mode === 'production' ? 'production' : mode === 'test' ? 'test' : 'development';
const { assertDatabaseSafety, assertProductionMigration } = await import('../server/environment.ts');
const commands = {
  bootstrap: ['node_modules/tsx/dist/cli.mjs', 'server/db/bootstrap-admin.ts'],
  seed: ['node_modules/tsx/dist/cli.mjs', 'server/db/seed-test.ts'],
  dev: ['node_modules/tsx/dist/cli.mjs', 'watch', 'server/index.ts'],
  test: ['node_modules/vitest/vitest.mjs', 'run'],
  migrate: ['node_modules/tsx/dist/cli.mjs', 'server/db/migrate.ts'],
  generate: ['node_modules/drizzle-kit/bin.cjs', 'generate'],
  studio: ['node_modules/drizzle-kit/bin.cjs', 'studio'],
  import: ['node_modules/tsx/dist/cli.mjs', 'server/administrators/import-catalog.ts'],
  start: ['dist/index.js'],
};
if (!Object.hasOwn(commands, command)) throw new Error('Comando inválido');
if (command !== 'test') assertDatabaseSafety();
if (['migrate', 'generate', 'studio', 'import'].includes(command)) assertProductionMigration();
const result = spawnSync(process.execPath, [...commands[command], ...(command === 'test' ? process.argv.slice(4) : [])], { env: process.env, stdio: 'inherit' });
if (result.error) throw new Error('Não foi possível iniciar o comando. Verifique as dependências instaladas.');
process.exit(result.status ?? 1);
