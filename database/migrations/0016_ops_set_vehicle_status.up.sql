-- Privileged status write for the development EoL reset endpoint only.
-- Application Go code must NEVER call set_config('karea.allow_status_rewind', …).
-- That GUC remains a DBA-only escape hatch (see migration 0015 comments).
-- This function keeps the bypass inside the database so EOL reset can rewind
-- without teaching the API how to flip the session flag.

CREATE OR REPLACE FUNCTION fn_ops_set_vehicle_status(
    p_vin TEXT,
    p_status vehicle_status_enum
) RETURNS VOID AS $$
BEGIN
    -- Local to this function's statement context / surrounding transaction.
    PERFORM set_config('karea.allow_status_rewind', 'true', true);
    UPDATE vehicles
       SET current_global_status = p_status,
           status_before_hold = NULL,
           hold_reason = NULL
     WHERE vin = p_vin;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'vehicle % not found', p_vin;
    END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fn_ops_set_vehicle_status(TEXT, vehicle_status_enum) IS
    'Development / ops helper: set vehicle status allowing one-way rewind. '
    'Not a public API; called only by the APP_ENV=development EOL reset path. '
    'Manual data repairs should use SET LOCAL karea.allow_status_rewind in psql instead.';
