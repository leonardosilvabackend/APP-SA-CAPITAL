-- EXECUTAR SOMENTE DEPOIS DO SMOKE TEST COM O RUNTIME RESTRITO.
-- Uso com psql: \set owner_role sa_capital_owner
--               \set legacy_role postgres

\set ON_ERROR_STOP on
BEGIN;
REVOKE :owner_role FROM :legacy_role;
REVOKE SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM :legacy_role;
REVOKE USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public FROM :legacy_role;
COMMIT;
