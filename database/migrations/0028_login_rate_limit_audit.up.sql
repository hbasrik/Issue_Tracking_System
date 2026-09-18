-- Login rate-limit events are plant-wide (email + IP), not tied to a VIN.
-- Make vin nullable and add LOGIN_RATE_LIMITED so blocked attempts land in
-- audit_logs without inventing a fake vehicle FK.

ALTER TABLE audit_logs ALTER COLUMN vin DROP NOT NULL;

DO $migrate$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_enum e
          JOIN pg_type t ON t.oid = e.enumtypid
         WHERE t.typname = 'audit_event_enum'
           AND e.enumlabel = 'LOGIN_RATE_LIMITED'
    ) THEN
        ALTER TYPE audit_event_enum ADD VALUE 'LOGIN_RATE_LIMITED';
    END IF;
END
$migrate$;
