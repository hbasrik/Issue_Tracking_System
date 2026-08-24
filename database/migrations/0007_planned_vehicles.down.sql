-- Reverse Karar 10 schema (except the PLANNED enum label, which PostgreSQL
-- cannot drop without rewriting vehicle_status_enum). Existing PLANNED rows
-- are moved to IN_PRODUCTION before the column restorations.

UPDATE vehicles
SET current_global_status = 'IN_PRODUCTION'
WHERE current_global_status::text = 'PLANNED';

-- Restore the three functions to the 0002 bodies (without PLANNED branches).
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
    NEW.current_station_id := v_first_station_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_initialize_vehicle_progress()
RETURNS TRIGGER AS $$
BEGIN
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
        current_station_id = (SELECT id FROM stations WHERE sequence_no = v_new_station_id)
    WHERE vin = NEW.vin;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

UPDATE vehicles
SET vehicle_model_id = (SELECT id FROM vehicle_models ORDER BY id LIMIT 1)
WHERE vehicle_model_id IS NULL;

ALTER TABLE vehicles ALTER COLUMN vehicle_model_id SET NOT NULL;

ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS vehicle_number VARCHAR(30) UNIQUE;
UPDATE vehicles SET vehicle_number = vin WHERE vehicle_number IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_vehicle_number ON vehicles (vehicle_number);

COMMENT ON COLUMN vehicles.vehicle_number IS
    'Karar 5: short factory number used for lookup instead of a separate Full_VIN_List master table.';
