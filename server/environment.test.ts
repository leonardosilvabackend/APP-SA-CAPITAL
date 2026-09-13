import { describe, expect, it } from 'vitest';
import { validateEnvironment, validateMigrationRole } from './environment';
const local = { APP_ENV: 'development', NODE_ENV: 'development', DATABASE_ENV: 'development', DATABASE_URL: 'postgresql://dev:fake@127.0.0.1:5433/sa_capital_development' };
describe('isolamento de ambientes', () => {
  it('aceita banco local dedicado', () => expect(validateEnvironment(local, true).production).toBe(false));
  it('exige banco configurado', () => expect(() => validateEnvironment({ APP_ENV: 'development' }, true)).toThrow('DATABASE_URL'));
  it('recusa banco declarado produção', () => expect(() => validateEnvironment({ ...local, DATABASE_ENV: 'production' }, true)).toThrow('DATABASE_ENV'));
  it.each(['postgresql://dev:secret@production.example/sa_capital_development', 'postgresql://dev:secret@127.0.0.1:5433/postgres', 'postgresql://dev:secret@127.0.0.1:5433/sa_capital_development?host=production.example', 'postgresql://dev:secret@localhost/sa_capital_development'])('bloqueia destino inseguro (%#)', url => {
    try { validateEnvironment({ ...local, DATABASE_URL: url }, true); throw new Error('não bloqueou'); }
    catch (error) { expect((error as Error).message).toContain('bloqueado'); expect((error as Error).message).not.toContain('secret'); }
  });
  it('separa teste de desenvolvimento', () => expect(() => validateEnvironment({ ...local, APP_ENV: 'test', NODE_ENV: 'test', DATABASE_ENV: 'test' }, true)).toThrow('bloqueado'));
  it('recusa produção local', () => expect(() => validateEnvironment({ ...local, APP_ENV: 'production', NODE_ENV: 'production', DATABASE_ENV: 'production' }, true)).toThrow('Railway'));
  it('aceita produção explícita no deploy', () => expect(validateEnvironment({ ...local, APP_ENV: 'production', NODE_ENV: 'production', DATABASE_ENV: 'production', RAILWAY_ENVIRONMENT_ID: 'example', RAILWAY_SERVICE_ID: 'example', RAILWAY_DEPLOYMENT_ID: 'example' }, true).production).toBe(true));
  it('recusa flags inválidas', () => expect(() => validateEnvironment({ ...local, ENABLE_SCHEDULED_JOBS: 'yes' })).toThrow('true ou false'));
  it('exige owner nas migrations de producao', () => expect(() => validateMigrationRole({}, true)).toThrow('SA_MIGRATION_ROLE'));
  it('recusa owner com identificador inseguro', () => expect(() => validateMigrationRole({ SA_MIGRATION_ROLE: 'owner; drop role' }, true)).toThrow('invalido'));
  it('aceita owner PostgreSQL simples', () => expect(validateMigrationRole({ SA_MIGRATION_ROLE: 'sa_capital_owner' }, true)).toBe('sa_capital_owner'));
});
