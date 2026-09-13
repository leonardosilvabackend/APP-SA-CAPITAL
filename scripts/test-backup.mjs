import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import postgres from 'postgres';

const url = new URL(process.env.SA_MIGRATION_DATABASE_URL ?? '');
if (url.hostname !== '127.0.0.1' || url.pathname !== '/sa_capital_test' || url.search || url.hash) throw new Error('Backup permitido somente no TEST local.');
const root = process.cwd();
const folder = path.resolve(root, '.local/backups');
if (!folder.startsWith(root + path.sep)) throw new Error('Diretorio invalido.');
fs.mkdirSync(folder, { recursive: true });
const id = randomUUID().replaceAll('-', '');
const dump = path.join(folder, `test-${id}.dump`);
const restoreName = `sa_capital_test_restore_${id}`;
if (!/^sa_capital_test_restore_[a-f0-9]{32}$/.test(restoreName)) throw new Error('Destino de restauracao invalido.');
const connectionArgs = ['-h', url.hostname, '-p', url.port || '5432', '-U', decodeURIComponent(url.username)];
const childEnv = { ...process.env, PGPASSWORD: decodeURIComponent(url.password) };
function run(binary, args) {
  const result = spawnSync(path.resolve('.local/postgres/pgsql/bin', binary + '.exe'), args, { env: childEnv, windowsHide: true, encoding: 'utf8', timeout: 120_000 });
  if (result.status !== 0) throw new Error(`${binary} falhou. Arquivo original preservado.`);
}
const admin = postgres(url.toString(), { max: 1, prepare: false });
let created = false;
let expected;
try {
  await admin.begin('isolation level repeatable read read only', async tx => {
    const [snapshot] = await tx`select pg_export_snapshot() as id`;
    const tables = await tx`select tablename from pg_tables where schemaname='public' order by tablename`;
    expected = {};
    for (const { tablename } of tables) {
      const [row] = await tx`select count(*)::int as count from ${tx('public.' + tablename)}`;
      expected[tablename] = row.count;
    }
    run('pg_dump', [...connectionArgs, '-d', 'sa_capital_test', '--format=custom', '--no-owner', '--no-acl', `--snapshot=${snapshot.id}`, '--file', dump]);
  });
  await admin.unsafe(`CREATE DATABASE "${restoreName}"`); created = true;
  run('pg_restore', [...connectionArgs, '-d', restoreName, '--no-owner', '--no-acl', '--exit-on-error', dump]);
  const restoredUrl = new URL(url); restoredUrl.pathname = '/' + restoreName;
  const restored = postgres(restoredUrl.toString(), { max: 1, prepare: false });
  try {
    for (const [table, count] of Object.entries(expected)) {
      const [row] = await restored`select count(*)::int as count from ${restored('public.' + table)}`;
      if (row.count !== count) throw new Error('Divergencia na restauracao: ' + table);
    }
  } finally { await restored.end(); }
  const manifest = { environment: 'test', restored: true, completedAt: new Date().toISOString(), sha256: createHash('sha256').update(fs.readFileSync(dump)).digest('hex'), tables: expected, storage: 'Not configured in TEST; external objects are not part of this backup.' };
  fs.writeFileSync(dump + '.json', JSON.stringify(manifest, null, 2));
  console.log(`Backup TEST restaurado e conferido: ${dump}. Manifesto sem credenciais.`);
} finally {
  if (created) await admin.unsafe(`DROP DATABASE "${restoreName}" WITH (FORCE)`);
  await admin.end();
}
