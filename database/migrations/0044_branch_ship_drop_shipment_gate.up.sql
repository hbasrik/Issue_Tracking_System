-- Branch shipment no longer requires the Shipment checklist (Karar 33).
--
-- The 46 shipment items are now done at the stations. fn_enforce_branch_shipment
-- keeps every other gate: active EOL BRANCH items and active TEST items present
-- and OK/CONDITIONAL_OK, every station step OK; open issues stay a warning.
--
-- Body of migration 0037 with exactly two changes: the v_shipment_incomplete /
-- v_shipment_missing declarations and the shipment block are removed. Nothing
-- else differs. checklist_type_enum keeps SHIPMENT; no row is touched.
-- CREATE OR REPLACE: idempotent.

CREATE OR REPLACE FUNCTION fn_enforce_branch_shipment()
RETURNS TRIGGER AS $$
DECLARE
    v_open_issue_count INT;
    v_branch_incomplete INT;
    v_branch_missing INT;
    v_test_incomplete INT;
    v_test_missing INT;
    v_station_steps_remaining INT;
    v_old_status TEXT;
BEGIN
    IF NEW.branch_shipped_at IS NOT NULL AND OLD.branch_shipped_at IS NULL THEN
        SELECT
            count(*) FILTER (
                WHERE p.id IS NOT NULL
                  AND p.check_status NOT IN ('OK', 'CONDITIONAL_OK')
            )::int,
            count(*) FILTER (WHERE p.id IS NULL)::int
        INTO v_branch_incomplete, v_branch_missing
        FROM vehicles v
        JOIN checklist_template_items cti
          ON cti.template_id = v.eol_template_id
         AND cti.is_active
         AND cti.eol_phase = 'BRANCH'
        LEFT JOIN checklist_item_progress p
          ON p.check_item_id = cti.id AND p.vin = v.vin
        WHERE v.vin = NEW.vin;

        IF v_branch_missing > 0 THEN
            RAISE EXCEPTION
                'Cannot ship vehicle % from branch — % branch-phase EoL item(s) not yet on the vehicle',
                NEW.vin, v_branch_missing;
        END IF;
        IF v_branch_incomplete > 0 THEN
            RAISE EXCEPTION
                'Cannot ship vehicle % from branch — branch-phase EoL items are not all OK/CONDITIONAL_OK',
                NEW.vin;
        END IF;

        SELECT
            count(*) FILTER (
                WHERE p.id IS NOT NULL
                  AND p.check_status NOT IN ('OK', 'CONDITIONAL_OK')
            )::int,
            count(*) FILTER (WHERE p.id IS NULL)::int
        INTO v_test_incomplete, v_test_missing
        FROM vehicles v
        JOIN checklist_template_items cti
          ON cti.template_id = v.test_template_id AND cti.is_active
        LEFT JOIN checklist_item_progress p
          ON p.check_item_id = cti.id AND p.vin = v.vin
        WHERE v.vin = NEW.vin;

        IF v_test_missing > 0 THEN
            RAISE EXCEPTION
                'Cannot ship vehicle % from branch — % test checklist item(s) not yet on the vehicle',
                NEW.vin, v_test_missing;
        END IF;
        IF v_test_incomplete > 0 THEN
            RAISE EXCEPTION
                'Cannot ship vehicle % from branch — test checklist is not fully OK/CONDITIONAL_OK',
                NEW.vin;
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

        SELECT current_global_status::text INTO v_old_status
        FROM vehicles WHERE vin = NEW.vin;

        INSERT INTO audit_logs (vin, event_type, old_value, new_value, performed_by, metadata)
        VALUES (NEW.vin, 'EOL_WORKFLOW_STAGE_CHANGE', 'BRANCH', 'DEPOT', NEW.branch_shipped_by,
                jsonb_build_object('open_issue_count_warning', v_open_issue_count, 'blocked', FALSE));

        UPDATE vehicles
        SET current_global_status = 'IN_WAREHOUSE'
        WHERE vin = NEW.vin
          AND current_global_status IS DISTINCT FROM 'IN_WAREHOUSE';

        IF FOUND THEN
            INSERT INTO audit_logs (vin, event_type, old_value, new_value, performed_by, metadata)
            VALUES (NEW.vin, 'STATUS_CHANGE', v_old_status, 'IN_WAREHOUSE', NEW.branch_shipped_by,
                    jsonb_build_object('trigger', 'eol_branch_ship'));
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
