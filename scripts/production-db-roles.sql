-- FASE 1/2 - TEMPLATE PARA DBA/SUPABASE, ANTES DAS MIGRATIONS.
-- NAO EXECUTAR SEM BACKUP RESTAURADO, JANELA E NOMES APROVADOS.
-- Uso com psql: \set owner_role sa_capital_owner
--               \set db_name nome_do_banco
--               \set migrator_role sa_capital_migrator
--               \set runtime_role sa_capital_runtime
--               \set legacy_role postgres
--               \set migrator_password '...'
--               \set runtime_password '...'

\set ON_ERROR_STOP on
BEGIN;

CREATE ROLE :owner_role NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE ROLE :migrator_role LOGIN PASSWORD :'migrator_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE ROLE :runtime_role LOGIN PASSWORD :'runtime_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
GRANT :owner_role TO :migrator_role, :legacy_role;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT CONNECT ON DATABASE :db_name TO :migrator_role, :runtime_role;
GRANT USAGE, CREATE ON SCHEMA public TO :owner_role;

-- Objetos existentes da aplicacao passam ao papel sem login. As migrations
-- conectam com migrator_role e usam SA_MIGRATION_ROLE=owner_role.
SELECT format('ALTER TABLE %I.%I OWNER TO %I', schemaname, tablename, :'owner_role')
FROM pg_tables WHERE schemaname = 'public'
\gexec

SELECT format('ALTER SEQUENCE %I.%I OWNER TO %I', sequence_schema, sequence_name, :'owner_role')
FROM information_schema.sequences WHERE sequence_schema = 'public'
\gexec

SELECT format('ALTER FUNCTION %I.%I(%s) OWNER TO %I', n.nspname, p.proname,
              pg_get_function_identity_arguments(p.oid), :'owner_role')
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
\gexec

ALTER SCHEMA drizzle OWNER TO :owner_role;
SELECT format('ALTER TABLE %I.%I OWNER TO %I', schemaname, tablename, :'owner_role')
FROM pg_tables WHERE schemaname = 'drizzle'
\gexec
SELECT format('ALTER SEQUENCE %I.%I OWNER TO %I', sequence_schema, sequence_name, :'owner_role')
FROM information_schema.sequences WHERE sequence_schema = 'drizzle'
\gexec

-- Mantem o runtime atual operacional ate a troca controlada da DATABASE_URL.
GRANT USAGE ON SCHEMA public TO :legacy_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :legacy_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO :legacy_role;

COMMIT;

-- Depois de pnpm db:migrate:prod, execute production-db-runtime-grants.sql.
-- Depois do smoke test com DATABASE_URL restrita, revogue owner_role de legacy_role.
