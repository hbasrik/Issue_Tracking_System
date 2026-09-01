DROP TRIGGER IF EXISTS trg_enforce_eol_deliver ON vehicle_eol_workflow;
DROP FUNCTION IF EXISTS fn_enforce_eol_deliver();

DELETE FROM role_permissions
WHERE permission_id = (SELECT id FROM permissions WHERE code = 'eol.deliver');

DELETE FROM permissions WHERE code = 'eol.deliver';

ALTER TABLE vehicle_eol_workflow
    DROP COLUMN IF EXISTS delivered_at,
    DROP COLUMN IF EXISTS delivered_by;

-- Restore migration 0011 depot-release → SHIPPED behaviour.
CREATE OR REPLACE FUNCTION fn_eol_depot_release_ships()
RETURNS TRIGGER AS $$
DECLARE
    v_old_status TEXT;
BEGIN
    IF NEW.depot_released_at IS NOT NULL AND OLD.depot_released_at IS NULL THEN
        SELECT current_global_status::text INTO v_old_status
        FROM vehicles WHERE vin = NEW.vin;

        UPDATE vehicles
        SET current_global_status = 'SHIPPED'
        WHERE vin = NEW.vin
          AND current_global_status IS DISTINCT FROM 'SHIPPED';

        IF FOUND THEN
            INSERT INTO audit_logs (vin, event_type, old_value, new_value, performed_by, metadata)
            VALUES (NEW.vin, 'STATUS_CHANGE', COALESCE(v_old_status, 'IN_WAREHOUSE'), 'SHIPPED',
                    NEW.depot_released_by,
                    jsonb_build_object('trigger', 'eol_depot_release'));
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_eol_depot_release_ships ON vehicle_eol_workflow;

CREATE TRIGGER trg_eol_depot_release_ships
    AFTER UPDATE OF depot_released_at ON vehicle_eol_workflow
    FOR EACH ROW EXECUTE FUNCTION fn_eol_depot_release_ships();

-- Restore auto IN_WAREHOUSE → WITH_CUSTOMER on shipment checklist completion.
CREATE OR REPLACE FUNCTION fn_check_shipment_completion()
RETURNS TRIGGER AS $$
DECLARE
    v_incomplete_count INT;
    v_old_status TEXT;
BEGIN
    IF NEW.checklist_type = 'SHIPMENT' AND NEW.check_status IN ('OK', 'CONDITIONAL_OK') THEN
        SELECT count(*) INTO v_incomplete_count
        FROM checklist_item_progress
        WHERE vin = NEW.vin
          AND checklist_type = 'SHIPMENT'
          AND check_status NOT IN ('OK', 'CONDITIONAL_OK');

        IF v_incomplete_count = 0 THEN
            SELECT current_global_status::text INTO v_old_status
            FROM vehicles WHERE vin = NEW.vin;

            UPDATE vehicles
            SET current_global_status = 'WITH_CUSTOMER'
            WHERE vin = NEW.vin
              AND current_global_status = 'IN_WAREHOUSE';

            IF FOUND THEN
                INSERT INTO audit_logs (vin, event_type, old_value, new_value, performed_by, metadata)
                VALUES (NEW.vin, 'STATUS_CHANGE', 'IN_WAREHOUSE', 'WITH_CUSTOMER',
                        NEW.checker_id,
                        jsonb_build_object('trigger', 'shipment_checklist_completion'));
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_shipment_completion ON checklist_item_progress;

CREATE TRIGGER trg_check_shipment_completion
    AFTER INSERT OR UPDATE OF check_status ON checklist_item_progress
    FOR EACH ROW EXECUTE FUNCTION fn_check_shipment_completion();

-- Restore 0011 manual-status and branch/depot triggers (WITH_CUSTOMER naming).
CREATE OR REPLACE FUNCTION fn_enforce_manual_status_change()
RETURNS TRIGGER AS $$
DECLARE
    v_shipment_incomplete BOOLEAN;
    v_depot_not_released BOOLEAN;
BEGIN
    IF NEW.current_global_status = OLD.current_global_status THEN
        RETURN NEW;
    END IF;

    IF NEW.current_global_status = 'WITH_CUSTOMER' THEN
        SELECT EXISTS (
            SELECT 1 FROM checklist_item_progress
            WHERE vin = NEW.vin AND checklist_type = 'SHIPMENT'
              AND check_status NOT IN ('OK', 'CONDITIONAL_OK')
        ) INTO v_shipment_incomplete;

        IF v_shipment_incomplete THEN
            RAISE EXCEPTION 'Cannot move vehicle % to WITH_CUSTOMER — shipment checklist is not fully OK/CONDITIONAL_OK', NEW.vin;
        END IF;
    END IF;

    IF NEW.current_global_status = 'SHIPPED' THEN
        SELECT NOT EXISTS (
            SELECT 1 FROM vehicle_eol_workflow
            WHERE vin = NEW.vin AND depot_released_at IS NOT NULL
        ) INTO v_depot_not_released;

        IF v_depot_not_released THEN
            RAISE EXCEPTION 'Cannot move vehicle % to SHIPPED — vehicle has not been released from depot', NEW.vin;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_enforce_branch_shipment()
RETURNS TRIGGER AS $$
DECLARE
    v_open_issue_count INT;
    v_branch_incomplete BOOLEAN;
BEGIN
    IF NEW.branch_shipped_at IS NOT NULL AND OLD.branch_shipped_at IS NULL THEN
        SELECT EXISTS (
            SELECT 1
            FROM checklist_item_progress p
            JOIN checklist_template_items cti ON cti.id = p.check_item_id
            WHERE p.vin = NEW.vin
              AND p.checklist_type = 'EOL'
              AND cti.eol_phase = 'BRANCH'
              AND p.check_status NOT IN ('OK', 'CONDITIONAL_OK')
        ) INTO v_branch_incomplete;

        IF v_branch_incomplete THEN
            RAISE EXCEPTION 'Cannot ship vehicle % from branch — branch-phase EoL items are not all OK/CONDITIONAL_OK', NEW.vin;
        END IF;

        SELECT count(*) INTO v_open_issue_count
        FROM issue_list
        WHERE vin = NEW.vin AND status IN ('OPEN', 'IN_PROGRESS', 'DONE');

        NEW.branch_open_issue_count_at_shipment := v_open_issue_count;
        NEW.current_stage := 'DEPOT';

        UPDATE vehicles SET current_global_status = 'IN_WAREHOUSE' WHERE vin = NEW.vin;

        INSERT INTO audit_logs (vin, event_type, old_value, new_value, performed_by, metadata)
        VALUES (NEW.vin, 'EOL_WORKFLOW_STAGE_CHANGE', 'BRANCH', 'DEPOT', NEW.branch_shipped_by,
                jsonb_build_object('open_issue_count_warning', v_open_issue_count, 'blocked', FALSE));
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_enforce_depot_release()
RETURNS TRIGGER AS $$
DECLARE
    v_open_issue_count INT;
BEGIN
    IF NEW.depot_released_at IS NOT NULL AND OLD.depot_released_at IS NULL THEN
        IF NEW.branch_shipped_at IS NULL THEN
            RAISE EXCEPTION 'Cannot release vehicle % from depot — branch shipment has not been recorded', NEW.vin;
        END IF;

        SELECT count(*) INTO v_open_issue_count
        FROM issue_list
        WHERE vin = NEW.vin AND status IN ('OPEN', 'IN_PROGRESS', 'DONE');

        IF v_open_issue_count > 0 THEN
            RAISE EXCEPTION 'Cannot release vehicle % from depot — % open issue(s) remain', NEW.vin, v_open_issue_count;
        END IF;

        NEW.current_stage := 'COMPLETED';

        INSERT INTO audit_logs (vin, event_type, old_value, new_value, performed_by, metadata)
        VALUES (NEW.vin, 'EOL_WORKFLOW_STAGE_CHANGE', 'DEPOT', 'COMPLETED', NEW.depot_released_by,
                jsonb_build_object('open_issue_count', 0, 'blocked', FALSE));
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

ALTER TYPE vehicle_status_enum RENAME VALUE 'DELIVERED' TO 'WITH_CUSTOMER';
