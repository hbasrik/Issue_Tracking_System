-- Direct-SQL probes of fn_enforce_branch_shipment (Karar 33, migration 0044).
-- Run on a *_test database only. Everything happens inside one transaction
-- that is rolled back at the end; the fixture vehicle TMPSHIPRM00000001 never
-- persists.
--
-- Fixture: a new vehicle with every station step, EOL BRANCH item and TEST
-- item OK. If the vehicle has a SHIPMENT template its rows stay PENDING and
-- one is removed (missing). Each case breaks exactly one condition inside a
-- savepoint, tries UPDATE vehicle_eol_workflow SET branch_shipped_at, and
-- compares md5 of the workflow and vehicle rows before and after.

\set ON_ERROR_STOP on
\pset footer off
BEGIN;

INSERT INTO vehicles (vin) VALUES ('TMPSHIPRM00000001');
UPDATE vehicle_station_step_progress SET status = 'OK' WHERE vin = 'TMPSHIPRM00000001';
UPDATE checklist_item_progress p SET check_status = 'OK'
  FROM checklist_template_items c
 WHERE c.id = p.check_item_id AND p.vin = 'TMPSHIPRM00000001'
   AND (p.checklist_type = 'TEST' OR (p.checklist_type = 'EOL' AND c.eol_phase = 'BRANCH'));
DELETE FROM checklist_item_progress
 WHERE id = (SELECT min(id) FROM checklist_item_progress
              WHERE vin = 'TMPSHIPRM00000001' AND checklist_type = 'SHIPMENT');

SELECT v.shipment_template_id,
       (SELECT count(*) FROM checklist_template_items c WHERE c.template_id = v.shipment_template_id AND c.is_active) AS shipment_items,
       (SELECT count(*) FROM checklist_item_progress p WHERE p.vin = v.vin AND p.checklist_type = 'SHIPMENT') AS shipment_rows,
       (SELECT count(*) FROM checklist_item_progress p WHERE p.vin = v.vin AND p.checklist_type = 'SHIPMENT' AND p.check_status <> 'OK') AS shipment_not_ok
  FROM vehicles v WHERE v.vin = 'TMPSHIPRM00000001';

CREATE FUNCTION pg_temp.try_ship(label text) RETURNS TABLE (case_label text, result text, rows_unchanged text)
LANGUAGE plpgsql AS $$
DECLARE
    v_before text;
    v_after text;
    v_result text;
BEGIN
    SELECT md5(w::text) || '/' || md5(v::text) INTO v_before
      FROM vehicle_eol_workflow w JOIN vehicles v ON v.vin = w.vin WHERE w.vin = 'TMPSHIPRM00000001';
    BEGIN
        UPDATE vehicle_eol_workflow
           SET branch_shipped_at = now(), branch_shipped_by = (SELECT min(id) FROM users)
         WHERE vin = 'TMPSHIPRM00000001';
        SELECT 'ACCEPTED stage=' || w.current_stage || ' status=' || v.current_global_status INTO v_result
          FROM vehicle_eol_workflow w JOIN vehicles v ON v.vin = w.vin WHERE w.vin = 'TMPSHIPRM00000001';
        RAISE EXCEPTION USING ERRCODE = 'P0099', MESSAGE = 'undo accepted probe';
    EXCEPTION
        WHEN SQLSTATE 'P0099' THEN NULL;
        WHEN raise_exception THEN v_result := 'REJECTED: ' || SQLERRM;
    END;
    SELECT md5(w::text) || '/' || md5(v::text) INTO v_after
      FROM vehicle_eol_workflow w JOIN vehicles v ON v.vin = w.vin WHERE w.vin = 'TMPSHIPRM00000001';
    RETURN QUERY SELECT label, v_result,
        CASE WHEN v_before = v_after THEN 'yes ' || v_after ELSE 'NO ' || v_before || ' -> ' || v_after END;
END $$;

SELECT * FROM pg_temp.try_ship('1 shipment open, all else done');

SAVEPOINT s;
DELETE FROM checklist_item_progress WHERE id = (SELECT min(id) FROM checklist_item_progress WHERE vin = 'TMPSHIPRM00000001' AND checklist_type = 'TEST');
SELECT * FROM pg_temp.try_ship('2 test item missing');
ROLLBACK TO SAVEPOINT s;

SAVEPOINT s;
UPDATE checklist_item_progress SET check_status = 'NOT_OK', rejected_desc = 'probe'
 WHERE id = (SELECT min(id) FROM checklist_item_progress WHERE vin = 'TMPSHIPRM00000001' AND checklist_type = 'TEST');
SELECT * FROM pg_temp.try_ship('3 test item NOT_OK');
ROLLBACK TO SAVEPOINT s;

SAVEPOINT s;
DELETE FROM checklist_item_progress WHERE id = (
    SELECT min(p.id) FROM checklist_item_progress p JOIN checklist_template_items c ON c.id = p.check_item_id
     WHERE p.vin = 'TMPSHIPRM00000001' AND p.checklist_type = 'EOL' AND c.eol_phase = 'BRANCH');
SELECT * FROM pg_temp.try_ship('4 branch EOL item missing');
ROLLBACK TO SAVEPOINT s;

SAVEPOINT s;
UPDATE checklist_item_progress SET check_status = 'NOT_OK', rejected_desc = 'probe'
 WHERE id = (
    SELECT min(p.id) FROM checklist_item_progress p JOIN checklist_template_items c ON c.id = p.check_item_id
     WHERE p.vin = 'TMPSHIPRM00000001' AND p.checklist_type = 'EOL' AND c.eol_phase = 'BRANCH');
SELECT * FROM pg_temp.try_ship('5 branch EOL item NOT_OK');
ROLLBACK TO SAVEPOINT s;

SAVEPOINT s;
UPDATE vehicle_station_step_progress SET status = 'PENDING'
 WHERE id = (SELECT min(id) FROM vehicle_station_step_progress WHERE vin = 'TMPSHIPRM00000001');
SELECT * FROM pg_temp.try_ship('6 station step PENDING');
ROLLBACK TO SAVEPOINT s;

ROLLBACK;

SELECT count(*) AS fixture_rows_left FROM vehicles WHERE vin = 'TMPSHIPRM00000001';
