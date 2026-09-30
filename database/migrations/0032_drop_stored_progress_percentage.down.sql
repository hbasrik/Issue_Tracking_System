-- Restores the pre-0032 station-only column, its trigger write and the view.
-- The column holds station steps only (old meaning), not the percentage the
-- application shows.

ALTER TABLE vehicles
    ADD COLUMN IF NOT EXISTS total_progress_percentage NUMERIC(5,2) NOT NULL DEFAULT 0.00
        CHECK (total_progress_percentage BETWEEN 0 AND 100);

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

COMMENT ON FUNCTION fn_recalculate_vehicle_progress() IS NULL;

UPDATE vehicles v
SET total_progress_percentage = COALESCE((
    SELECT round(100.0 * count(*) FILTER (WHERE s.status = 'OK') / NULLIF(count(*), 0), 2)
    FROM vehicle_station_step_progress s
    WHERE s.vin = v.vin
), 0);

CREATE OR REPLACE VIEW vw_vehicle_completion_split AS
SELECT count(*) FILTER (WHERE total_progress_percentage >= 100) AS completed_vehicles,
       count(*) FILTER (WHERE total_progress_percentage < 100) AS in_progress_vehicles
FROM vehicles;
