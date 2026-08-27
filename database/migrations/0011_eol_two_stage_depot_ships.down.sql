-- Restore the three-stage EOL flow (Şube → Depo → Evrak) and the SHIPPED
-- gate that required document_approved_at. Vehicles already moved to
-- COMPLETED / SHIPPED by the up migration are not rewound.

DROP TRIGGER IF EXISTS trg_eol_depot_release_ships ON vehicle_eol_workflow;
DROP FUNCTION IF EXISTS fn_eol_depot_release_ships();

CREATE OR REPLACE FUNCTION fn_enforce_manual_status_change()
RETURNS TRIGGER AS $$
DECLARE
    v_shipment_incomplete BOOLEAN;
    v_document_not_approved BOOLEAN;
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
            WHERE vin = NEW.vin AND document_approved_at IS NOT NULL
        ) INTO v_document_not_approved;

        IF v_document_not_approved THEN
            RAISE EXCEPTION 'Cannot move vehicle % to SHIPPED — EOL document phase is not approved', NEW.vin;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_enforce_branch_shipment()
RETURNS TRIGGER AS $$
DECLARE
    v_open_issue_count INT;
BEGIN
    IF NEW.branch_shipped_at IS NOT NULL AND OLD.branch_shipped_at IS NULL THEN
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
        SELECT count(*) INTO v_open_issue_count
        FROM issue_list
        WHERE vin = NEW.vin AND status IN ('OPEN', 'IN_PROGRESS', 'DONE');

        IF v_open_issue_count > 0 THEN
            RAISE EXCEPTION 'Cannot release vehicle % from depot — % open issue(s) remain', NEW.vin, v_open_issue_count;
        END IF;

        NEW.current_stage := 'DOCUMENT';

        INSERT INTO audit_logs (vin, event_type, old_value, new_value, performed_by, metadata)
        VALUES (NEW.vin, 'EOL_WORKFLOW_STAGE_CHANGE', 'DEPOT', 'DOCUMENT', NEW.depot_released_by,
                jsonb_build_object('open_issue_count', 0, 'blocked', FALSE));
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_document_approval ON vehicle_eol_workflow;

CREATE OR REPLACE FUNCTION fn_enforce_document_approval()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.document_approved_at IS NOT NULL AND OLD.document_approved_at IS NULL THEN
        UPDATE vehicle_eol_workflow
        SET current_stage = 'COMPLETED'
        WHERE vin = NEW.vin
          AND current_stage IS DISTINCT FROM 'COMPLETED';

        UPDATE vehicles SET current_global_status = 'SHIPPED' WHERE vin = NEW.vin;

        INSERT INTO audit_logs (vin, event_type, old_value, new_value, performed_by, metadata)
        VALUES (NEW.vin, 'EOL_WORKFLOW_STAGE_CHANGE', 'DOCUMENT', 'COMPLETED', NEW.document_approved_by, '{}'::jsonb);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_document_approval
    AFTER UPDATE OF document_approved_at ON vehicle_eol_workflow
    FOR EACH ROW EXECUTE FUNCTION fn_enforce_document_approval();
