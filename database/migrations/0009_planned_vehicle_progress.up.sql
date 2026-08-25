-- PLANNED vehicles must still get shop-floor progress rows (station steps,
-- checklist items, EOL workflow). Skipping them in 0007 deadlocked Karar 10:
-- PLANNED -> IN_PRODUCTION only fires when a station-step progress row is
-- processed, but that row was never created.
--
-- Recalculate is updated first so materializing PENDING rows does not itself
-- enter the line. The first non-PENDING station-step update does.

COMMENT ON COLUMN vehicles.current_global_status IS
    'Auto-transitioned by triggers. PLANNED -> IN_PRODUCTION when the first '
    'station-step progress row is processed (status leaves PENDING). '
    'IN_PRODUCTION -> IN_WAREHOUSE when EOL branch phase ships. '
    'IN_WAREHOUSE -> WITH_CUSTOMER when the shipment checklist is fully '
    'OK/CONDITIONAL_OK. Final -> SHIPPED when the EOL document phase is approved.';

CREATE OR REPLACE FUNCTION fn_recalculate_vehicle_progress()
RETURNS TRIGGER AS $$
DECLARE
    v_total INT;
    v_done INT;
    v_new_percentage NUMERIC(5,2);
    v_new_station_id INT;
    v_enter_line BOOLEAN;
BEGIN
    SELECT count(*), count(*) FILTER (WHERE status = 'OK')
    INTO v_total, v_done
    FROM vehicle_station_step_progress
    WHERE vin = NEW.vin;

    v_new_percentage := CASE WHEN v_total = 0 THEN 0 ELSE round((v_done::NUMERIC / v_total) * 100, 2) END;

    SELECT COALESCE(
        (SELECT MIN(s.sequence_no)
         FROM vehicle_station_step_progress vssp
         JOIN stations s ON s.id = vssp.station_id
         WHERE vssp.vin = NEW.vin AND vssp.status <> 'OK'),
        (SELECT MAX(sequence_no) FROM stations WHERE is_active = TRUE)
    ) INTO v_new_station_id;

    -- INSERT of PENDING catalogue copies must leave PLANNED vehicles parked
    -- (current_station_id stays NULL). Ticking a step (OK / NOT_OK / …)
    -- enters the line.
    v_enter_line := TG_OP = 'UPDATE' AND NEW.status::text IS DISTINCT FROM 'PENDING';

    UPDATE vehicles
    SET total_progress_percentage = v_new_percentage,
        current_station_id = CASE
            WHEN current_global_status::text = 'PLANNED' AND NOT v_enter_line THEN current_station_id
            ELSE (SELECT id FROM stations WHERE sequence_no = v_new_station_id)
        END,
        current_global_status = CASE
            WHEN current_global_status::text = 'PLANNED' AND v_enter_line THEN 'IN_PRODUCTION'::vehicle_status_enum
            ELSE current_global_status
        END
    WHERE vin = NEW.vin;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_materialize_vehicle_progress(
    p_vin VARCHAR(17),
    p_eol_template_id INT,
    p_shipment_template_id INT,
    p_test_template_id INT
) RETURNS void AS $$
BEGIN
    INSERT INTO vehicle_station_step_progress (vin, station_id, station_step_id, status)
    SELECT p_vin, ss.station_id, ss.id, 'PENDING'
    FROM station_steps ss
    WHERE ss.is_active = TRUE
    ON CONFLICT (vin, station_step_id) DO NOTHING;

    INSERT INTO checklist_item_progress (vin, checklist_type, check_item_id, check_status)
    SELECT p_vin, 'EOL', cti.id, 'PENDING'
    FROM checklist_template_items cti
    WHERE cti.template_id = p_eol_template_id AND cti.is_active = TRUE
    ON CONFLICT (vin, check_item_id) DO NOTHING;

    INSERT INTO checklist_item_progress (vin, checklist_type, check_item_id, check_status)
    SELECT p_vin, 'SHIPMENT', cti.id, 'PENDING'
    FROM checklist_template_items cti
    WHERE cti.template_id = p_shipment_template_id AND cti.is_active = TRUE
    ON CONFLICT (vin, check_item_id) DO NOTHING;

    INSERT INTO checklist_item_progress (vin, checklist_type, check_item_id, check_status)
    SELECT p_vin, 'TEST', cti.id, 'PENDING'
    FROM checklist_template_items cti
    WHERE cti.template_id = p_test_template_id AND cti.is_active = TRUE
    ON CONFLICT (vin, check_item_id) DO NOTHING;

    INSERT INTO vehicle_eol_workflow (vin, current_stage)
    VALUES (p_vin, 'BRANCH')
    ON CONFLICT (vin) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_initialize_vehicle_progress()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM fn_materialize_vehicle_progress(
        NEW.vin,
        NEW.eol_template_id,
        NEW.shipment_template_id,
        NEW.test_template_id
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Generic (vehicle_model_id IS NULL) templates already match NULL-model
-- vehicles via `OR vehicle_model_id IS NULL`. Fill any leftover NULLs, then
-- materialize missing progress rows without deleting vehicles.
UPDATE vehicles v
SET
    eol_template_id = COALESCE(v.eol_template_id, (
        SELECT id FROM checklist_templates
        WHERE type = 'EOL' AND is_active = TRUE
          AND (vehicle_model_id IS NOT DISTINCT FROM v.vehicle_model_id OR vehicle_model_id IS NULL)
        ORDER BY vehicle_model_id NULLS LAST
        LIMIT 1
    )),
    shipment_template_id = COALESCE(v.shipment_template_id, (
        SELECT id FROM checklist_templates
        WHERE type = 'SHIPMENT' AND is_active = TRUE
          AND (vehicle_model_id IS NOT DISTINCT FROM v.vehicle_model_id OR vehicle_model_id IS NULL)
        ORDER BY vehicle_model_id NULLS LAST
        LIMIT 1
    )),
    test_template_id = COALESCE(v.test_template_id, (
        SELECT id FROM checklist_templates
        WHERE type = 'TEST' AND is_active = TRUE
          AND (vehicle_model_id IS NOT DISTINCT FROM v.vehicle_model_id OR vehicle_model_id IS NULL)
        ORDER BY vehicle_model_id NULLS LAST
        LIMIT 1
    ))
WHERE v.eol_template_id IS NULL
   OR v.shipment_template_id IS NULL
   OR v.test_template_id IS NULL;

SELECT fn_materialize_vehicle_progress(
    v.vin, v.eol_template_id, v.shipment_template_id, v.test_template_id
)
FROM vehicles v;
