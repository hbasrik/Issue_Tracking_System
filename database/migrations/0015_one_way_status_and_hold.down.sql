-- Revert one-way status + hold columns.

CREATE OR REPLACE FUNCTION fn_enforce_manual_status_change()
RETURNS TRIGGER AS $$
DECLARE
    v_not_delivered BOOLEAN;
BEGIN
    IF NEW.current_global_status = OLD.current_global_status THEN
        RETURN NEW;
    END IF;

    IF NEW.current_global_status = 'DELIVERED' THEN
        SELECT NOT EXISTS (
            SELECT 1 FROM vehicle_eol_workflow
            WHERE vin = NEW.vin AND delivered_at IS NOT NULL
        ) INTO v_not_delivered;

        IF v_not_delivered THEN
            RAISE EXCEPTION 'Cannot move vehicle % to DELIVERED — vehicle has not been marked delivered in EoL workflow', NEW.vin;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP FUNCTION IF EXISTS fn_vehicle_status_rank(vehicle_status_enum);

ALTER TABLE vehicles
    DROP COLUMN IF EXISTS hold_reason,
    DROP COLUMN IF EXISTS status_before_hold;
