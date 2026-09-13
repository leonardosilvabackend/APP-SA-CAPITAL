import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { parse } from 'dotenv';
import postgres from 'postgres';

const url = new URL(process.env.SA_MIGRATION_DATABASE_URL ?? '');
if (url.hostname !== '127.0.0.1' || url.pathname !== '/sa_capital_test' || url.search || url.hash) throw new Error('Somente banco local TEST.');
const appFile = fs.readFileSync('.env.test', 'utf8');
const env = parse(appFile);
if (env.APP_ENV !== 'test' || env.DATABASE_ENV !== 'test') throw new Error('Ambiente TEST obrigatorio.');
const currentUrl = new URL(env.DATABASE_URL);
const password = currentUrl.username === 'sa_test_app' ? decodeURIComponent(currentUrl.password) : randomBytes(32).toString('base64url');
const db = postgres(url.toString(), { max: 1, prepare: false });
try {
  await db.begin(async tx => {
    const [existing] = await tx`select 1 from pg_roles where rolname='sa_test_app'`;
    await tx.unsafe(`${existing ? 'ALTER' : 'CREATE'} ROLE sa_test_app LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION`);
    await tx`revoke create on schema public from public`;
    await tx`revoke create on database sa_capital_test from public`;
    await tx`grant connect on database sa_capital_test to sa_test_app`;
    await tx`grant usage on schema public to sa_test_app`;
    await tx`grant select, insert, update, delete on all tables in schema public to sa_test_app`;
    await tx`grant usage, select on all sequences in schema public to sa_test_app`;
    await tx`revoke update, delete, truncate on audit_events from sa_test_app`;
  });
  url.username = 'sa_test_app'; url.password = password;
  const restricted = postgres(url.toString(), { max: 1, prepare: false });
  try {
    const [role] = await restricted`select rolsuper,rolcreatedb,rolcreaterole from pg_roles where rolname=current_user`;
    if (role.rolsuper || role.rolcreatedb || role.rolcreaterole) throw new Error('Privilegios excessivos.');
    await restricted`select count(*) from quotas`;
  } finally { await restricted.end(); }
  fs.writeFileSync('.env.test', appFile.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL=${url.toString()}`));
  console.log('Aplicativo TEST configurado com usuario restrito; credencial nao exibida.');
} finally { await db.end(); }
