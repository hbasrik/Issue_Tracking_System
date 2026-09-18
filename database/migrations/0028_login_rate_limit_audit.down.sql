-- Postgres cannot remove a single enum value safely. Drop rows that used the
-- login event, then restore the NOT NULL vin constraint only when no nulls
-- remain (LOGIN_RATE_LIMITED rows are deleted first).

DELETE FROM audit_logs WHERE event_type = 'LOGIN_RATE_LIMITED';

ALTER TABLE audit_logs ALTER COLUMN vin SET NOT NULL;
