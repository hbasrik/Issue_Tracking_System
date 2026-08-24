-- Karar 10: PLANNED vehicle status, drop short factory number, nullable model.

ALTER TYPE vehicle_status_enum ADD VALUE IF NOT EXISTS 'PLANNED' BEFORE 'IN_PRODUCTION';

DROP INDEX IF EXISTS idx_vehicles_vehicle_number;
ALTER TABLE vehicles DROP COLUMN IF EXISTS vehicle_number;

ALTER TABLE vehicles ALTER COLUMN vehicle_model_id DROP NOT NULL;

COMMENT ON COLUMN vehicles.vehicle_model_id IS
    'Nullable for PLANNED bulk-imported VINs whose model is not known yet (Karar 10).';

COMMENT ON COLUMN vehicles.current_global_status IS
    'Auto-transitioned by triggers. PLANNED -> IN_PRODUCTION on the first '
    'vehicle_station_step_progress row (Karar 10). IN_PRODUCTION -> IN_WAREHOUSE when '
    'EOL branch phase ships. IN_WAREHOUSE -> WITH_CUSTOMER when the shipment checklist '
    'is fully OK/CONDITIONAL_OK. Final -> SHIPPED when the EOL document phase is approved.';

-- Do not park a PLANNED VIN at station 1; it has not entered the line yet.
CREATE OR REPLACE FUNCTION fn_assign_checklist_templates()
RETURNS TRIGGER AS $$
DECLARE
    v_eol_template_id INT;
    v_shipment_template_id INT;
    v_test_template_id INT;
    v_first_station_id INT;
BEGIN
    SELECT id INTO v_eol_template_id
    FROM checklist_templates
    WHERE type = 'EOL' AND is_active = TRUE
      AND (vehicle_model_id = NEW.vehicle_model_id OR vehicle_model_id IS NULL)
    ORDER BY vehicle_model_id NULLS LAST
    LIMIT 1;

    SELECT id INTO v_shipment_template_id
    FROM checklist_templates
    WHERE type = 'SHIPMENT' AND is_active = TRUE
      AND (vehicle_model_id = NEW.vehicle_model_id OR vehicle_model_id IS NULL)
    ORDER BY vehicle_model_id NULLS LAST
    LIMIT 1;

    SELECT id INTO v_test_template_id
    FROM checklist_templates
    WHERE type = 'TEST' AND is_active = TRUE
      AND (vehicle_model_id = NEW.vehicle_model_id OR vehicle_model_id IS NULL)
    ORDER BY vehicle_model_id NULLS LAST
    LIMIT 1;

    SELECT id INTO v_first_station_id FROM stations WHERE is_active = TRUE ORDER BY sequence_no LIMIT 1;

    NEW.eol_template_id := v_eol_template_id;
    NEW.shipment_template_id := v_shipment_template_id;
    NEW.test_template_id := v_test_template_id;
    IF NEW.current_global_status::text IS DISTINCT FROM 'PLANNED' THEN
        NEW.current_station_id := v_first_station_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- PLANNED bulk imports must not materialize shop-floor rows until the first
-- station-step progress row is written (that insert flips them to IN_PRODUCTION).
CREATE OR REPLACE FUNCTION fn_initialize_vehicle_progress()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.current_global_status::text = 'PLANNED' THEN
        RETURN NEW;
    END IF;

    INSERT INTO vehicle_station_step_progress (vin, station_id, station_step_id, status)
    SELECT NEW.vin, ss.station_id, ss.id, 'PENDING'
    FROM station_steps ss
    WHERE ss.is_active = TRUE;

    INSERT INTO checklist_item_progress (vin, checklist_type, check_item_id, check_status)
    SELECT NEW.vin, 'EOL', cti.id, 'PENDING'
    FROM checklist_template_items cti
    WHERE cti.template_id = NEW.eol_template_id AND cti.is_active = TRUE;

    INSERT INTO checklist_item_progress (vin, checklist_type, check_item_id, check_status)
    SELECT NEW.vin, 'SHIPMENT', cti.id, 'PENDING'
    FROM checklist_template_items cti
    WHERE cti.template_id = NEW.shipment_template_id AND cti.is_active = TRUE;

    INSERT INTO checklist_item_progress (vin, checklist_type, check_item_id, check_status)
    SELECT NEW.vin, 'TEST', cti.id, 'PENDING'
    FROM checklist_template_items cti
    WHERE cti.template_id = NEW.test_template_id AND cti.is_active = TRUE;

    INSERT INTO vehicle_eol_workflow (vin, current_stage)
    VALUES (NEW.vin, 'BRANCH');

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recalculate completion % / current station. Karar 10: the first progress
-- row for a PLANNED vehicle also enters it into IN_PRODUCTION.
CREATE OR REPLACE FUNCTION fn_recalculate_vehicle_progress()
RETURNS TRIGGER AS $$
DECLARE
    v_total INT;
    v_done INT;
    v_new_percentage NUMERIC(5,2);
    v_new_station_id INT;
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

    UPDATE vehicles
    SET total_progress_percentage = v_new_percentage,
        current_station_id = (SELECT id FROM stations WHERE sequence_no = v_new_station_id),
        current_global_status = CASE
            WHEN current_global_status::text = 'PLANNED' THEN 'IN_PRODUCTION'::vehicle_status_enum
            ELSE current_global_status
        END
    WHERE vin = NEW.vin;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
