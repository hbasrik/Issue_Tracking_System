-- Branch ship: also require every station step OK before depot shipment.
-- Conscious change to Karar 1 soft-warning rule for station steps.

CREATE OR REPLACE FUNCTION fn_enforce_branch_shipment()
RETURNS TRIGGER AS $$
DECLARE
    v_open_issue_count INT;
    v_branch_incomplete BOOLEAN;
    v_test_incomplete BOOLEAN;
    v_shipment_incomplete BOOLEAN;
    v_station_steps_remaining INT;
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

        SELECT count(*)::int INTO v_station_steps_remaining
          FROM vehicle_station_step_progress
         WHERE vin = NEW.vin
           AND status <> 'OK';

        IF v_station_steps_remaining > 0 THEN
            RAISE EXCEPTION 'Cannot ship vehicle % from branch — % station step(s) still incomplete', NEW.vin, v_station_steps_remaining;
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
