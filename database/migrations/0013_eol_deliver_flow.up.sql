-- EOL flow: branch ship gates TEST + SHIPMENT + EOL BRANCH; depot release stays
-- IN_WAREHOUSE; explicit deliver sets DELIVERED. Removes auto shipment-completion
-- trigger and depot-release → SHIPPED writer from migration 0011.

ALTER TYPE vehicle_status_enum RENAME VALUE 'WITH_CUSTOMER' TO 'DELIVERED';

ALTER TABLE vehicle_eol_workflow
    ADD COLUMN delivered_at TIMESTAMPTZ,
    ADD COLUMN delivered_by INT REFERENCES users(id);

-- Shipment checklist completion no longer auto-advances vehicle status.
DROP TRIGGER IF EXISTS trg_check_shipment_completion ON checklist_item_progress;

CREATE OR REPLACE FUNCTION fn_check_shipment_completion()
RETURNS TRIGGER AS $$
BEGIN
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Depot release completes the workflow but does not write SHIPPED.
DROP TRIGGER IF EXISTS trg_eol_depot_release_ships ON vehicle_eol_workflow;

CREATE OR REPLACE FUNCTION fn_eol_depot_release_ships()
RETURNS TRIGGER AS $$
BEGIN
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Manual DELIVERED requires the workflow deliver stamp; SHIPPED is legacy-only.
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

-- Branch ship: EOL BRANCH + TEST + SHIPMENT must all pass (open issues stay soft-warning).
CREATE OR REPLACE FUNCTION fn_enforce_branch_shipment()
RETURNS TRIGGER AS $$
DECLARE
    v_open_issue_count INT;
    v_branch_incomplete BOOLEAN;
    v_test_incomplete BOOLEAN;
    v_shipment_incomplete BOOLEAN;
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

        SELECT EXISTS (
            SELECT 1 FROM checklist_item_progress
            WHERE vin = NEW.vin AND checklist_type = 'TEST'
              AND check_status NOT IN ('OK', 'CONDITIONAL_OK')
        ) INTO v_test_incomplete;

        IF v_test_incomplete THEN
            RAISE EXCEPTION 'Cannot ship vehicle % from branch — test checklist is not fully OK/CONDITIONAL_OK', NEW.vin;
        END IF;

        SELECT EXISTS (
            SELECT 1 FROM checklist_item_progress
            WHERE vin = NEW.vin AND checklist_type = 'SHIPMENT'
              AND check_status NOT IN ('OK', 'CONDITIONAL_OK')
        ) INTO v_shipment_incomplete;

        IF v_shipment_incomplete THEN
            RAISE EXCEPTION 'Cannot ship vehicle % from branch — shipment checklist is not fully OK/CONDITIONAL_OK', NEW.vin;
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

-- Depot release: hard-block open issues + every DEPOT-phase EoL item passing.
CREATE OR REPLACE FUNCTION fn_enforce_depot_release()
RETURNS TRIGGER AS $$
DECLARE
    v_open_issue_count INT;
    v_depot_incomplete BOOLEAN;
BEGIN
    IF NEW.depot_released_at IS NOT NULL AND OLD.depot_released_at IS NULL THEN
        IF NEW.branch_shipped_at IS NULL THEN
            RAISE EXCEPTION 'Cannot release vehicle % from depot — branch shipment has not been recorded', NEW.vin;
        END IF;

        SELECT EXISTS (
            SELECT 1
            FROM checklist_item_progress p
            JOIN checklist_template_items cti ON cti.id = p.check_item_id
            WHERE p.vin = NEW.vin
              AND p.checklist_type = 'EOL'
              AND cti.eol_phase = 'DEPOT'
              AND p.check_status NOT IN ('OK', 'CONDITIONAL_OK')
        ) INTO v_depot_incomplete;

        IF v_depot_incomplete THEN
            RAISE EXCEPTION 'Cannot release vehicle % from depot — depot-phase EoL items are not all OK/CONDITIONAL_OK', NEW.vin;
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

-- Deliver: one-time stamp after depot release; writes DELIVERED on the vehicle.
CREATE OR REPLACE FUNCTION fn_enforce_eol_deliver()
RETURNS TRIGGER AS $$
DECLARE
    v_old_status TEXT;
BEGIN
    IF NEW.delivered_at IS NOT NULL AND OLD.delivered_at IS NULL THEN
        IF NEW.depot_released_at IS NULL THEN
            RAISE EXCEPTION 'Cannot mark vehicle % delivered — depot release has not been recorded', NEW.vin;
        END IF;

        SELECT current_global_status::text INTO v_old_status
        FROM vehicles WHERE vin = NEW.vin;

        UPDATE vehicles
        SET current_global_status = 'DELIVERED'
        WHERE vin = NEW.vin
          AND current_global_status IS DISTINCT FROM 'DELIVERED';

        IF FOUND THEN
            INSERT INTO audit_logs (vin, event_type, old_value, new_value, performed_by, metadata)
            VALUES (NEW.vin, 'STATUS_CHANGE', COALESCE(v_old_status, 'IN_WAREHOUSE'), 'DELIVERED',
                    NEW.delivered_by,
                    jsonb_build_object('trigger', 'eol_deliver'));
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_eol_deliver ON vehicle_eol_workflow;

CREATE TRIGGER trg_enforce_eol_deliver
    AFTER UPDATE OF delivered_at ON vehicle_eol_workflow
    FOR EACH ROW EXECUTE FUNCTION fn_enforce_eol_deliver();

INSERT INTO permissions (code, description) VALUES
    ('eol.deliver', 'Mark a vehicle as delivered after depot release')
ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code = 'eol.deliver'
WHERE r.code = 'MANAGER_ADMIN'
ON CONFLICT DO NOTHING;
