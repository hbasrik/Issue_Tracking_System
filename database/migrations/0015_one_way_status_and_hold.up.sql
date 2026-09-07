-- One-way vehicle status machine + hold restore columns.
-- Free manual status edits are rejected; ON_HOLD parks/restores prior status.
--
-- Session GUC: karea.allow_status_rewind
-- ---------------------------------------
-- What: optional escape hatch read by fn_enforce_manual_status_change. When
--   true for the current transaction, the one-way rank check (and ON_HOLD
--   restore-target check) is skipped so a status can move backward or skip.
-- When: ONLY for interactive DBA / ops corrections in psql (or equivalent),
--   e.g. repairing rows whose stamps and current_global_status disagree:
--     BEGIN;
--     SELECT set_config('karea.allow_status_rewind', 'true', true);
--     UPDATE vehicles SET current_global_status = '…' WHERE vin = '…';
--     COMMIT;
-- Why: production paths (EoL branch-ship / depot-release / deliver, hold /
--   unhold) must stay forward-only; a rare data-fix tool is needed without
--   DROP TRIGGER. The application layer must never set this GUC — grep the
--   Go/TS tree for allow_status_rewind and expect zero hits. Development EoL
--   reset uses fn_ops_set_vehicle_status (migration 0016), which keeps any
--   bypass inside the database rather than exposing this flag to the API.

ALTER TABLE vehicles
    ADD COLUMN IF NOT EXISTS status_before_hold vehicle_status_enum,
    ADD COLUMN IF NOT EXISTS hold_reason TEXT;

COMMENT ON COLUMN vehicles.status_before_hold IS
    'Status restored when leaving ON_HOLD; set only while on hold.';
COMMENT ON COLUMN vehicles.hold_reason IS
    'Required reason when placing a vehicle on hold.';

CREATE OR REPLACE FUNCTION fn_vehicle_status_rank(p_status vehicle_status_enum)
RETURNS INT AS $$
BEGIN
    RETURN CASE p_status::text
        WHEN 'PLANNED' THEN 0
        WHEN 'IN_PRODUCTION' THEN 1
        WHEN 'IN_WAREHOUSE' THEN 2
        WHEN 'DELIVERED' THEN 3
        WHEN 'SHIPPED' THEN 3  -- legacy synonym of delivered end-state
        WHEN 'ON_HOLD' THEN -1
        ELSE -2
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Enforces forward-only status changes (and ON_HOLD park/restore).
-- DBA-only: SET LOCAL / set_config('karea.allow_status_rewind','true',true)
-- inside a transaction to allow a controlled rewind. Never set from the app.
CREATE OR REPLACE FUNCTION fn_enforce_manual_status_change()
RETURNS TRIGGER AS $$
DECLARE
    v_old_rank INT;
    v_new_rank INT;
    v_allow_rewind BOOLEAN;
    v_has_deliver BOOLEAN;
BEGIN
    IF NEW.current_global_status IS NOT DISTINCT FROM OLD.current_global_status THEN
        RETURN NEW;
    END IF;

    v_allow_rewind := COALESCE(
        NULLIF(current_setting('karea.allow_status_rewind', true), ''),
        'false'
    ) = 'true';

    -- Leave ON_HOLD → must restore status_before_hold (unless rewind).
    IF OLD.current_global_status = 'ON_HOLD' THEN
        IF NEW.current_global_status = 'ON_HOLD' THEN
            RETURN NEW;
        END IF;
        IF NOT v_allow_rewind THEN
            IF OLD.status_before_hold IS NULL THEN
                RAISE EXCEPTION
                    'Cannot leave ON_HOLD for vehicle % — no prior status recorded',
                    NEW.vin;
            END IF;
            IF NEW.current_global_status IS DISTINCT FROM OLD.status_before_hold THEN
                RAISE EXCEPTION
                    'Cannot leave ON_HOLD for vehicle % — must restore to % (got %)',
                    NEW.vin, OLD.status_before_hold, NEW.current_global_status;
            END IF;
        END IF;
        NEW.status_before_hold := NULL;
        NEW.hold_reason := NULL;
        RETURN NEW;
    END IF;

    -- Enter ON_HOLD from an active non-terminal status.
    IF NEW.current_global_status = 'ON_HOLD' THEN
        IF OLD.current_global_status IN ('PLANNED', 'DELIVERED', 'SHIPPED') THEN
            RAISE EXCEPTION
                'Cannot place vehicle % on hold from status %',
                NEW.vin, OLD.current_global_status;
        END IF;
        IF NEW.status_before_hold IS NULL THEN
            NEW.status_before_hold := OLD.current_global_status;
        END IF;
        IF NEW.hold_reason IS NULL OR btrim(NEW.hold_reason) = '' THEN
            RAISE EXCEPTION
                'Cannot place vehicle % on hold without a reason', NEW.vin;
        END IF;
        RETURN NEW;
    END IF;

    IF v_allow_rewind THEN
        RETURN NEW;
    END IF;

    v_old_rank := fn_vehicle_status_rank(OLD.current_global_status);
    v_new_rank := fn_vehicle_status_rank(NEW.current_global_status);

    IF v_old_rank < 0 OR v_new_rank < 0 THEN
        RAISE EXCEPTION
            'Invalid status transition for vehicle %: % → %',
            NEW.vin, OLD.current_global_status, NEW.current_global_status;
    END IF;

    -- Forward only, no skip. Workflow stamps are enforced by EOL triggers;
    -- this function only locks the direction of vehicles.current_global_status.
    IF v_new_rank <> v_old_rank + 1 THEN
        RAISE EXCEPTION
            'Vehicle % status must advance one step (got % → %)',
            NEW.vin, OLD.current_global_status, NEW.current_global_status;
    END IF;

    -- DELIVERED still requires the deliver stamp (AFTER-trigger / direct API).
    IF NEW.current_global_status = 'DELIVERED' THEN
        SELECT EXISTS (
            SELECT 1 FROM vehicle_eol_workflow
            WHERE vin = NEW.vin AND delivered_at IS NOT NULL
        ) INTO v_has_deliver;
        IF NOT v_has_deliver THEN
            RAISE EXCEPTION
                'Cannot move vehicle % to DELIVERED — deliver stamp not recorded',
                NEW.vin;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
