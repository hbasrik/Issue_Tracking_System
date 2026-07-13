-- golang-migrate: reverse extension setup
-- Note: dropping extensions may fail if dependent objects exist in later migrations.
DROP EXTENSION IF EXISTS "pg_trgm";
DROP EXTENSION IF EXISTS "uuid-ossp";
