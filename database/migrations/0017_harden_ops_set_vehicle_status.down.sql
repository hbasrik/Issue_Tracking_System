-- Restore the pre-harden body (still development-oriented; see 0016).
CREATE OR REPLACE FUNCTION fn_ops_set_vehicle_status(
    p_vin TEXT,
    p_status vehicle_status_enum
) RETURNS VOID AS $$
BEGIN
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
