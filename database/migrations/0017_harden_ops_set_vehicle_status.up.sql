-- Harden fn_ops_set_vehicle_status: refuse unless the session GUC
-- karea.app_env is exactly 'development'. The API pool sets that GUC from
-- APP_ENV on every connection (AfterConnect). Production/staging connections
-- therefore cannot use this bypass even if the SQL is invoked somehow.
-- Manual DBA repairs continue to use karea.allow_status_rewind in psql
-- (they do not need this function).

CREATE OR REPLACE FUNCTION fn_ops_set_vehicle_status(
    p_vin TEXT,
    p_status vehicle_status_enum
) RETURNS VOID AS $$
DECLARE
    v_env TEXT;
BEGIN
    v_env := lower(coalesce(nullif(current_setting('karea.app_env', true), ''), ''));
    IF v_env IS DISTINCT FROM 'development' THEN
        RAISE EXCEPTION
            'fn_ops_set_vehicle_status is disabled (karea.app_env=%); only APP_ENV=development may rewind via the API',
            coalesce(nullif(v_env, ''), '<unset>');
    END IF;

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
    'Development-only status rewind for POST /eol/reset. Requires session '
    'karea.app_env=development (set by the API pool from APP_ENV). Production '
    'must not wire EOLReset; this function still refuses without the GUC. '
    'Manual repairs: SET LOCAL karea.allow_status_rewind in psql — do not use this function.';
