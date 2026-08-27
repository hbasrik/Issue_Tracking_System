-- EOL flow is now two stages: BRANCH (şube sevk) → DEPOT (serbest bırakma).
-- Depot release completes the workflow (COMPLETED) and is the SHIPPED writer.
--
-- vehicle_eol_workflow.document_approved_at / document_approved_by are NOT
-- dropped. They stay so the unused document stage can be re-enabled later;
-- nothing in this migration writes them, and the document-approval trigger
-- is removed from the flow.

-- SHIPPED is allowed once the depot has released (not document approval).
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

-- Branch shipment still warns on open issues. It now also refuses until
-- every BRANCH-phase EoL item is OK or CONDITIONAL_OK (the same gate the
-- "Şubeden Depoya Sevk" button uses).
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

-- Depot release: still hard-blocks on open issues, and now also requires
-- branch shipment. Completes the workflow; SHIPPED is written AFTER the
-- row is visible so fn_enforce_manual_status_change sees depot_released_at.
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

-- Document approval is out of the live flow. Keep the function as a no-op
-- so a forgotten CREATE TRIGGER would not ship a vehicle; do not attach it.
DROP TRIGGER IF EXISTS trg_enforce_document_approval ON vehicle_eol_workflow;

CREATE OR REPLACE FUNCTION fn_enforce_document_approval()
RETURNS TRIGGER AS $$
BEGIN
    -- Intentionally empty: document_approved_at / document_approved_by remain
    -- on vehicle_eol_workflow for a possible future re-enable, but they are
    -- not read or written by the current Şube → Depo flow.
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Vehicles that finished depot and were waiting on the removed document
-- stage would otherwise be stuck (depot_released_at already set). Advance
-- them the same way a depot release now does. Other vehicles are untouched.
UPDATE vehicles v
SET current_global_status = 'SHIPPED'
FROM vehicle_eol_workflow w
WHERE w.vin = v.vin
  AND w.current_stage = 'DOCUMENT'
  AND w.depot_released_at IS NOT NULL
  AND v.current_global_status NOT IN ('SHIPPED', 'WITH_CUSTOMER');

UPDATE vehicle_eol_workflow
SET current_stage = 'COMPLETED'
WHERE current_stage = 'DOCUMENT';
