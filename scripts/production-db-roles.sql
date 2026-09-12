-- TEMPLATE PARA DBA/RAILWAY. NAO EXECUTAR SEM BACKUP E JANELA APROVADA.
-- Uso com psql: \set owner_role sa_capital_owner
--               \set db_name nome_do_banco
--               \set migrator_role sa_capital_migrator
--               \set runtime_role sa_capital_runtime
--               \set migrator_password '...'
--               \set runtime_password '...'

CREATE ROLE :owner_role NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE ROLE :migrator_role LOGIN PASSWORD :'migrator_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE ROLE :runtime_role LOGIN PASSWORD :'runtime_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
GRANT :owner_role TO :migrator_role;

-- O DBA deve transferir para owner_role somente os objetos desta aplicacao.
-- ALTER TABLE public.<tabela> OWNER TO :owner_role;
-- ALTER SEQUENCE public.<sequencia> OWNER TO :owner_role;
-- ALTER FUNCTION public.<funcao>(<assinatura>) OWNER TO :owner_role;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT CONNECT ON DATABASE :db_name TO :migrator_role, :runtime_role;
GRANT USAGE ON SCHEMA public TO :runtime_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :runtime_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO :runtime_role;
ALTER DEFAULT PRIVILEGES FOR ROLE :owner_role IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :runtime_role;
ALTER DEFAULT PRIVILEGES FOR ROLE :owner_role IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO :runtime_role;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.audit_events FROM :runtime_role;

-- Verificacao: runtime nao pode CREATE/ALTER/DROP nem UPDATE/DELETE audit_events.
-- DATABASE_URL usa runtime_role; SA_MIGRATION_DATABASE_URL usa migrator_role.
