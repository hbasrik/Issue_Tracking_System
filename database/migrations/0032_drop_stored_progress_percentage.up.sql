-- One progress number (docs/11 Karar 16).
--
-- vehicles.total_progress_percentage counted station steps only, while every
-- screen, print and API response shows the applicable-set percentage (station
-- steps + EOL branch + TEST + SHIPMENT + EOL depot items, stage rule in
-- backend/internal/repository/postgres/stage_applicability.go). The stored
-- column said 100% for vehicles still on the line or waiting for depot items.
-- Keeping it in sync would mean re-writing the stage rule in PL/pgSQL, so the
-- column goes; the application computes the percentage on read.
--
-- vw_vehicle_completion_split was the only reader and nothing queries it; it
-- is dropped instead of being rebuilt on a second copy of the rule.
--
-- fn_recalculate_vehicle_progress stays: it still moves current_station_id
-- and PLANNED -> IN_PRODUCTION on the first ticked station step.

DROP VIEW IF EXISTS vw_vehicle_completion_split;

CREATE OR REPLACE FUNCTION fn_recalculate_vehicle_progress()
RETURNS TRIGGER AS $$
DECLARE
    v_new_station_id INT;
    v_enter_line BOOLEAN;
BEGIN
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
    SET current_station_id = CASE
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

COMMENT ON FUNCTION fn_recalculate_vehicle_progress() IS
    'Moves current_station_id and PLANNED -> IN_PRODUCTION after a station-step '
    'change. Stores no percentage: progress is computed on read (Karar 16).';

ALTER TABLE vehicles DROP COLUMN IF EXISTS total_progress_percentage;
