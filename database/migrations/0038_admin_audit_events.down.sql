-- Removes the four management audit values from audit_event_enum.
--
-- PostgreSQL cannot drop a single enum value, so the type is rebuilt without
-- them. Management audit rows are history that must not be lost: when any row
-- uses one of the values the rollback stops with an error instead of deleting
-- them. Running it again after a successful rollback is a no-op.

DO $rollback$
DECLARE
    removed CONSTANT text[] := ARRAY[
        'USER_ADMIN_CHANGE',
        'ROLE_PERMISSION_CHANGE',
        'CHECKLIST_TEMPLATE_CHANGE',
        'DEFECT_CATALOG_CHANGE'
    ];
    in_use bigint;
    kept text;
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_enum e
          JOIN pg_type t ON t.oid = e.enumtypid
         WHERE t.typname = 'audit_event_enum'
           AND e.enumlabel = ANY (removed)
    ) THEN
        RAISE NOTICE '0038 down: management audit values already absent';
        RETURN;
    END IF;

    SELECT count(*) INTO in_use
      FROM audit_logs
     WHERE event_type::text = ANY (removed);
    IF in_use > 0 THEN
        RAISE EXCEPTION
            '0038 down refused: % audit_logs rows use management event types; they are history and are not deleted',
            in_use;
    END IF;

    SELECT string_agg(quote_literal(e.enumlabel), ', ' ORDER BY e.enumsortorder)
      INTO kept
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
     WHERE t.typname = 'audit_event_enum'
       AND NOT (e.enumlabel = ANY (removed));

    ALTER TYPE audit_event_enum RENAME TO audit_event_enum_0038;
    EXECUTE 'CREATE TYPE audit_event_enum AS ENUM (' || kept || ')';
    ALTER TABLE audit_logs
        ALTER COLUMN event_type TYPE audit_event_enum
        USING event_type::text::audit_event_enum;
    DROP TYPE audit_event_enum_0038;
END
$rollback$;
