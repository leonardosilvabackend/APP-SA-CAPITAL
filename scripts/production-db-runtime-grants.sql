-- FASE 2/2 - EXECUTAR DEPOIS DAS MIGRATIONS, COMO DBA/OWNER.
-- Uso com psql: \set owner_role sa_capital_owner
--               \set runtime_role sa_capital_runtime

\set ON_ERROR_STOP on
BEGIN;

GRANT USAGE ON SCHEMA public TO :runtime_role;
REVOKE CREATE ON SCHEMA public FROM :runtime_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :runtime_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO :runtime_role;
ALTER DEFAULT PRIVILEGES FOR ROLE :owner_role IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :runtime_role;
ALTER DEFAULT PRIVILEGES FOR ROLE :owner_role IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO :runtime_role;

REVOKE ALL ON SCHEMA drizzle FROM :runtime_role;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.audit_events FROM :runtime_role;

COMMIT;

-- Verificar em uma conexao separada do runtime:
-- current_user = runtime_role; rolsuper/rolcreatedb/rolcreaterole = false;
-- SELECT/INSERT/UPDATE/DELETE nas tabelas operacionais funcionam;
-- CREATE/ALTER/DROP falham; audit_events aceita SELECT/INSERT e recusa mutacao.
