import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { existsSync } from 'node:fs';
const [action = 'start'] = process.argv.slice(2);
if (!['start', 'stop'].includes(action)) throw new Error('Use start ou stop.');
const executable = path.resolve('.local/postgres/pgsql/bin/pg_ctl.exe');
const data = path.resolve('.local/postgres-data-test');
if (!existsSync(executable) || !existsSync(path.join(data, 'PG_VERSION'))) throw new Error('PostgreSQL local de teste ainda não foi preparado. Veja docs/AMBIENTES.md.');
const running = spawnSync(executable, ['-D', data, 'status'], { windowsHide: true, stdio: 'ignore' }).status === 0;
if (action === 'start' && running) { console.log('Banco TEST já está iniciado.'); process.exit(0); }
const result = spawnSync(executable, ['-D', data, '-l', path.resolve('.local/postgres-test.log'), ...(action === 'stop' ? ['-m', 'fast'] : []), action, '-w'], { windowsHide: true, stdio: 'inherit' });
process.exit(result.status ?? 1);
