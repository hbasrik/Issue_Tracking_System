-- Restore the 0007 bodies (PLANNED skip on initialize; flip on any progress
-- insert). Backfilled rows are left in place.

DROP FUNCTION IF EXISTS fn_materialize_vehicle_progress(VARCHAR, INT, INT, INT);

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
