-- Read-only login role for inspecting the live database (docs/11 Karar 28).
-- Not a migration: run by hand, once per server, as the table owner (karea).
--
--   psql "postgres://karea@localhost:5432/karea" -X -v ON_ERROR_STOP=1 \
--        -v ro_password='<PAROLA>' -f scripts/create-readonly-role.sql
--
-- The password is never stored in this file; pass it with -v ro_password=...
-- Re-running is safe: the role is created only if missing, grants are
-- idempotent, the password is reset to the given value.
--
-- karea_ro gets CONNECT, USAGE on public, SELECT on every table, view and
-- sequence, and SELECT on tables karea creates later. It gets no INSERT,
-- UPDATE, DELETE, TRUNCATE, REFERENCES or TRIGGER on any table, including
-- schema_migrations.
--
-- Two PUBLIC privileges are also revoked, because every role inherits them:
--   CREATE on schema public (the schema ACL here is =UC/karea, so any role
--   could create tables) and TEMPORARY on the database. karea owns the
--   schema and is a superuser, so the app is not affected.

\if :{?ro_password}
\else
  \echo 'ro_password is not set: run with -v ro_password=...'
  \quit
\endif

BEGIN;

SELECT 'CREATE ROLE karea_ro LOGIN'
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'karea_ro')
\gexec

ALTER ROLE karea_ro WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
    NOREPLICATION NOBYPASSRLS INHERIT CONNECTION LIMIT 5
    PASSWORD :'ro_password';

-- Second guard: sessions start read-only even if a privilege is ever missed.
ALTER ROLE karea_ro SET default_transaction_read_only = on;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE TEMPORARY ON DATABASE :"DBNAME" FROM PUBLIC;

GRANT CONNECT ON DATABASE :"DBNAME" TO karea_ro;
GRANT USAGE ON SCHEMA public TO karea_ro;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM karea_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO karea_ro;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM karea_ro;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO karea_ro;

ALTER DEFAULT PRIVILEGES FOR ROLE karea IN SCHEMA public
    GRANT SELECT ON TABLES TO karea_ro;
ALTER DEFAULT PRIVILEGES FOR ROLE karea IN SCHEMA public
    GRANT SELECT ON SEQUENCES TO karea_ro;

COMMIT;
