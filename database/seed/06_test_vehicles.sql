-- =====================================================================
-- DEV/TEST DATA ONLY — NEVER RUN IN PRODUCTION
-- =====================================================================
-- 06_test_vehicles.sql
--
-- Inserts 18 realistic vehicles that exercise every shop-floor and EoL
-- state built in v2. Safe to re-run: it deletes the previous copy of
-- these VINs (CASCADE) and recreates them.
--
-- This file is local-development fixture data. It must never be applied
-- to staging or production. There is no production equivalent.
--
-- Depends on: 01_stations, 02_stations_and_steps, 03_checklist_templates,
-- 04_users. Catalogue rows (vehicle_models, issue_types) are created
-- here if they are missing.
--
-- Triggers do the heavy lifting after each INSERT INTO vehicles:
--   trg_assign_checklist_templates  — EOL / SHIPMENT / TEST templates
--   trg_initialize_vehicle_progress — station-step + checklist rows +
--                                     vehicle_eol_workflow at BRANCH
-- Targeted UPDATEs below then move each vehicle to a known lifecycle
-- point. Manager-only actions (branch-ship / depot-release /
-- document-approve / issue approve) are attributed to
-- manager@karea.local; operators tick items and open/progress issues.
--
-- Fixture map (vehicle_number → purpose)
--   10042–10044  just started, IN_PRODUCTION, EoL BRANCH, ~0% checklists
--   10045–10047  mid-production, NOT_OK station step + OPEN issue (badge)
--   10048–10050  stations complete, EoL still BRANCH (branch-ship warning)
--   10051–10052  EoL DEPOT, issues closed — ready for successful depot-release
--   10053        EoL DEPOT, OPEN issue — depot-release must 409
--   10054–10055  EoL DOCUMENT (depot released, awaiting document approval)
--   10056        EoL DOCUMENT + shipment complete → WITH_CUSTOMER
--   10057–10059  EoL COMPLETED, vehicle status SHIPPED
-- =====================================================================

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM users WHERE email = 'manager@karea.local')
       OR NOT EXISTS (SELECT 1 FROM users WHERE email = 'operator.one@karea.local')
       OR NOT EXISTS (SELECT 1 FROM users WHERE email = 'operator.two@karea.local') THEN
        RAISE EXCEPTION '06_test_vehicles.sql requires 04_users.sql (seeded manager + 2 operators)';
    END IF;
    IF (SELECT count(*) FROM station_steps) < 56 THEN
        RAISE EXCEPTION '06_test_vehicles.sql requires 02_stations_and_steps.sql';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM checklist_templates WHERE type = 'EOL' AND is_active) THEN
        RAISE EXCEPTION '06_test_vehicles.sql requires 03_checklist_templates.sql';
    END IF;
END $$;

-- ---------------------------------------------------------------------
-- Catalogue the vehicles FK onto. Harmless on re-run.
-- ---------------------------------------------------------------------
INSERT INTO vehicle_models (name, code, is_active) VALUES
    ('KAREA Compact EV', 'KRC', TRUE),
    ('KAREA Cargo Van', 'KRV', TRUE)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    is_active = EXCLUDED.is_active;

INSERT INTO issue_types (name) VALUES
    ('Paint'),
    ('Electrical'),
    ('Trim'),
    ('Mechanical'),
    ('High Voltage')
ON CONFLICT (name) DO NOTHING;

-- Wipe a previous run of this fixture (progress, issues, workflow CASCADE).
DELETE FROM vehicles
WHERE vehicle_number IN (
    '10042', '10043', '10044', '10045', '10046', '10047', '10048', '10049',
    '10050', '10051', '10052', '10053', '10054', '10055', '10056', '10057',
    '10058', '10059'
);

-- ---------------------------------------------------------------------
-- Plain vehicle inserts. Templates + progress rows are trigger-created.
-- VIN is 17 chars, vehicle_number is the short factory number (Karar 5).
-- ---------------------------------------------------------------------
INSERT INTO vehicles (vin, vehicle_number, vehicle_model_id, created_at) VALUES
    ('1KTSKRC2XSB010042', '10042', (SELECT id FROM vehicle_models WHERE code = 'KRC'), now() - interval '14 days'),
    ('1KTSKRV2XSB010043', '10043', (SELECT id FROM vehicle_models WHERE code = 'KRV'), now() - interval '13 days'),
    ('1KTSKRC2XSB010044', '10044', (SELECT id FROM vehicle_models WHERE code = 'KRC'), now() - interval '12 days'),
    ('1KTSKRV2XSB010045', '10045', (SELECT id FROM vehicle_models WHERE code = 'KRV'), now() - interval '11 days'),
    ('1KTSKRC2XSB010046', '10046', (SELECT id FROM vehicle_models WHERE code = 'KRC'), now() - interval '10 days'),
    ('1KTSKRV2XSB010047', '10047', (SELECT id FROM vehicle_models WHERE code = 'KRV'), now() - interval '9 days'),
    ('1KTSKRC2XSB010048', '10048', (SELECT id FROM vehicle_models WHERE code = 'KRC'), now() - interval '8 days'),
    ('1KTSKRV2XSB010049', '10049', (SELECT id FROM vehicle_models WHERE code = 'KRV'), now() - interval '7 days'),
    ('1KTSKRC2XSB010050', '10050', (SELECT id FROM vehicle_models WHERE code = 'KRC'), now() - interval '6 days'),
    ('1KTSKRV2XSB010051', '10051', (SELECT id FROM vehicle_models WHERE code = 'KRV'), now() - interval '5 days'),
    ('1KTSKRC2XSB010052', '10052', (SELECT id FROM vehicle_models WHERE code = 'KRC'), now() - interval '5 days'),
    ('1KTSKRV2XSB010053', '10053', (SELECT id FROM vehicle_models WHERE code = 'KRV'), now() - interval '4 days'),
    ('1KTSKRC2XSB010054', '10054', (SELECT id FROM vehicle_models WHERE code = 'KRC'), now() - interval '4 days'),
    ('1KTSKRV2XSB010055', '10055', (SELECT id FROM vehicle_models WHERE code = 'KRV'), now() - interval '3 days'),
    ('1KTSKRC2XSB010056', '10056', (SELECT id FROM vehicle_models WHERE code = 'KRC'), now() - interval '3 days'),
    ('1KTSKRV2XSB010057', '10057', (SELECT id FROM vehicle_models WHERE code = 'KRV'), now() - interval '2 days'),
    ('1KTSKRC2XSB010058', '10058', (SELECT id FROM vehicle_models WHERE code = 'KRC'), now() - interval '2 days'),
    ('1KTSKRV2XSB010059', '10059', (SELECT id FROM vehicle_models WHERE code = 'KRV'), now() - interval '1 day');

-- Session-local helpers so this seed does not leave functions behind.
CREATE OR REPLACE FUNCTION pg_temp.mark_stations_ok(p_vin varchar, p_max_station_seq int, p_user int, p_at timestamptz)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    UPDATE vehicle_station_step_progress vssp
    SET status = 'OK', checked_by = p_user, checked_at = p_at
    FROM station_steps ss
    JOIN stations s ON s.id = ss.station_id
    WHERE vssp.station_step_id = ss.id
      AND vssp.vin = p_vin
      AND s.sequence_no <= p_max_station_seq;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.mark_all_stations_ok(p_vin varchar, p_user int, p_at timestamptz)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    UPDATE vehicle_station_step_progress
    SET status = 'OK', checked_by = p_user, checked_at = p_at
    WHERE vin = p_vin;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.fail_station_step(
    p_vin varchar, p_station_seq int, p_step_seq int, p_user int, p_at timestamptz
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    UPDATE vehicle_station_step_progress vssp
    SET status = 'NOT_OK', checked_by = p_user, checked_at = p_at
    FROM station_steps ss
    JOIN stations s ON s.id = ss.station_id
    WHERE vssp.station_step_id = ss.id
      AND vssp.vin = p_vin
      AND s.sequence_no = p_station_seq
      AND ss.sequence_no = p_step_seq;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.tick_checklist_range(
    p_vin varchar, p_type checklist_type_enum, p_from int, p_to int,
    p_user int, p_at timestamptz
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    UPDATE checklist_item_progress cip
    SET check_status = 'OK', checker_id = p_user, check_date = p_at
    FROM checklist_template_items cti
    WHERE cip.check_item_id = cti.id
      AND cip.vin = p_vin
      AND cip.checklist_type = p_type
      AND cti.item_no BETWEEN p_from AND p_to;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.tick_checklist_item(
    p_vin varchar, p_type checklist_type_enum, p_item_no int,
    p_status check_status_enum, p_user int, p_at timestamptz, p_desc text
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    UPDATE checklist_item_progress cip
    SET check_status = p_status,
        checker_id = p_user,
        check_date = p_at,
        rejected_desc = CASE WHEN p_status = 'NOT_OK' THEN p_desc ELSE cip.rejected_desc END,
        rejected_by   = CASE WHEN p_status = 'NOT_OK' THEN p_user ELSE cip.rejected_by END,
        rejected_date = CASE WHEN p_status = 'NOT_OK' THEN p_at ELSE cip.rejected_date END,
        rework_desc   = CASE WHEN p_status = 'REWORK' THEN p_desc ELSE cip.rework_desc END,
        rework_date   = CASE WHEN p_status = 'REWORK' THEN p_at ELSE cip.rework_date END,
        conditional_desc = CASE WHEN p_status = 'CONDITIONAL_OK' THEN p_desc ELSE cip.conditional_desc END,
        conditional_date = CASE WHEN p_status = 'CONDITIONAL_OK' THEN p_at ELSE cip.conditional_date END
    FROM checklist_template_items cti
    WHERE cip.check_item_id = cti.id
      AND cip.vin = p_vin
      AND cip.checklist_type = p_type
      AND cti.item_no = p_item_no;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.tick_all_checklist(
    p_vin varchar, p_type checklist_type_enum, p_user int, p_at timestamptz
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    UPDATE checklist_item_progress
    SET check_status = 'OK', checker_id = p_user, check_date = p_at
    WHERE vin = p_vin AND checklist_type = p_type;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.add_station_issue(
    p_vin varchar, p_station_seq int, p_step_seq int,
    p_type_name text, p_severity issue_severity_enum, p_desc text,
    p_status issue_status_enum, p_reporter int, p_at timestamptz,
    p_process_by int DEFAULT NULL, p_process_at timestamptz DEFAULT NULL,
    p_finish_by int DEFAULT NULL, p_finish_at timestamptz DEFAULT NULL,
    p_approve_by int DEFAULT NULL, p_approve_at timestamptz DEFAULT NULL,
    p_cond_by int DEFAULT NULL, p_cond_at timestamptz DEFAULT NULL,
    p_solution text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO issue_list (
        vin, source_type, source_station_step_id, station_id, issue_type_id,
        severity, description, status, issue_reporter_id, issue_date,
        process_reporter_id, process_date, finish_reporter_id, finish_date,
        approve_reporter_id, approve_date,
        conditional_approve_reporter_id, conditional_approve_date,
        solution_description
    )
    SELECT p_vin, 'STATION_STEP', ss.id, ss.station_id, it.id,
           p_severity, p_desc, p_status, p_reporter, p_at,
           p_process_by, p_process_at, p_finish_by, p_finish_at,
           p_approve_by, p_approve_at, p_cond_by, p_cond_at, p_solution
    FROM station_steps ss
    JOIN stations s ON s.id = ss.station_id
    JOIN issue_types it ON it.name = p_type_name
    WHERE s.sequence_no = p_station_seq AND ss.sequence_no = p_step_seq;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.add_checklist_issue(
    p_vin varchar, p_source issue_source_enum, p_item_no int,
    p_type_name text, p_severity issue_severity_enum, p_desc text,
    p_status issue_status_enum, p_reporter int, p_at timestamptz,
    p_process_by int DEFAULT NULL, p_process_at timestamptz DEFAULT NULL,
    p_finish_by int DEFAULT NULL, p_finish_at timestamptz DEFAULT NULL,
    p_approve_by int DEFAULT NULL, p_approve_at timestamptz DEFAULT NULL,
    p_cond_by int DEFAULT NULL, p_cond_at timestamptz DEFAULT NULL,
    p_solution text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    v_checklist checklist_type_enum;
    v_template_id int;
BEGIN
    v_checklist := CASE p_source
        WHEN 'EOL_ITEM' THEN 'EOL'::checklist_type_enum
        WHEN 'SHIPMENT_ITEM' THEN 'SHIPMENT'::checklist_type_enum
        WHEN 'TEST_ITEM' THEN 'TEST'::checklist_type_enum
    END;

    SELECT CASE v_checklist
        WHEN 'EOL' THEN v.eol_template_id
        WHEN 'SHIPMENT' THEN v.shipment_template_id
        WHEN 'TEST' THEN v.test_template_id
    END INTO v_template_id
    FROM vehicles v WHERE v.vin = p_vin;

    INSERT INTO issue_list (
        vin, source_type, source_check_item_id, station_id, issue_type_id,
        severity, description, status, issue_reporter_id, issue_date,
        process_reporter_id, process_date, finish_reporter_id, finish_date,
        approve_reporter_id, approve_date,
        conditional_approve_reporter_id, conditional_approve_date,
        solution_description
    )
    SELECT p_vin, p_source, cti.id, cti.station_id, it.id,
           p_severity, p_desc, p_status, p_reporter, p_at,
           p_process_by, p_process_at, p_finish_by, p_finish_at,
           p_approve_by, p_approve_at, p_cond_by, p_cond_at, p_solution
    FROM checklist_template_items cti
    JOIN issue_types it ON it.name = p_type_name
    WHERE cti.template_id = v_template_id AND cti.item_no = p_item_no;
END;
$$;

DO $$
DECLARE
    op1 int;
    op2 int;
    mgr int;
    v_vin varchar;
    shipped varchar[] := ARRAY[
        '1KTSKRV2XSB010057', '1KTSKRC2XSB010058', '1KTSKRV2XSB010059'
    ];
    document_vins varchar[] := ARRAY[
        '1KTSKRC2XSB010054', '1KTSKRV2XSB010055', '1KTSKRC2XSB010056'
    ];
    depot_ready varchar[] := ARRAY[
        '1KTSKRV2XSB010051', '1KTSKRC2XSB010052'
    ];
    branch_complete varchar[] := ARRAY[
        '1KTSKRC2XSB010048', '1KTSKRV2XSB010049', '1KTSKRC2XSB010050'
    ];
BEGIN
    SELECT id INTO STRICT op1 FROM users WHERE email = 'operator.one@karea.local';
    SELECT id INTO STRICT op2 FROM users WHERE email = 'operator.two@karea.local';
    SELECT id INTO STRICT mgr FROM users WHERE email = 'manager@karea.local';

    -- ============================================================
    -- Bucket 1: just started. A few early station ticks, no checklists.
    -- ============================================================
    -- 10042: untouched (every progress row still PENDING).
    UPDATE vehicle_station_step_progress vssp
    SET status = 'OK', checked_by = op1, checked_at = now() - interval '12 days'
    FROM station_steps ss
    JOIN stations s ON s.id = ss.station_id
    WHERE vssp.station_step_id = ss.id
      AND vssp.vin = '1KTSKRV2XSB010043'
      AND s.sequence_no = 1
      AND ss.sequence_no <= 2;

    PERFORM pg_temp.mark_stations_ok('1KTSKRC2XSB010044', 1, op2, now() - interval '11 days');

    -- ============================================================
    -- Bucket 2: mid-production. Mixed station steps + OPEN/IN_PROGRESS
    -- station-step issues (soft-warning badge on the vehicle).
    -- ============================================================
    -- 10045: stations 1–3 OK, station 4 step 3 NOT_OK + OPEN CRITICAL.
    PERFORM pg_temp.mark_stations_ok('1KTSKRV2XSB010045', 3, op1, now() - interval '8 days');
    UPDATE vehicle_station_step_progress vssp
    SET status = 'OK', checked_by = op1, checked_at = now() - interval '7 days'
    FROM station_steps ss
    JOIN stations s ON s.id = ss.station_id
    WHERE vssp.station_step_id = ss.id
      AND vssp.vin = '1KTSKRV2XSB010045'
      AND s.sequence_no = 4 AND ss.sequence_no <= 2;
    PERFORM pg_temp.fail_station_step('1KTSKRV2XSB010045', 4, 3, op1, now() - interval '7 days');
    PERFORM pg_temp.add_station_issue(
        '1KTSKRV2XSB010045', 4, 3, 'High Voltage', 'CRITICAL',
        'High voltage connector lock did not engage on the left-hand pack cable.',
        'OPEN', op1, now() - interval '7 days'
    );

    -- 10046: stations 1–4 OK, station 5 step 2 NOT_OK + OPEN MEDIUM.
    PERFORM pg_temp.mark_stations_ok('1KTSKRC2XSB010046', 4, op2, now() - interval '7 days');
    UPDATE vehicle_station_step_progress vssp
    SET status = 'OK', checked_by = op2, checked_at = now() - interval '6 days'
    FROM station_steps ss
    JOIN stations s ON s.id = ss.station_id
    WHERE vssp.station_step_id = ss.id
      AND vssp.vin = '1KTSKRC2XSB010046'
      AND s.sequence_no = 5 AND ss.sequence_no = 1;
    PERFORM pg_temp.fail_station_step('1KTSKRC2XSB010046', 5, 2, op2, now() - interval '6 days');
    PERFORM pg_temp.add_station_issue(
        '1KTSKRC2XSB010046', 5, 2, 'Mechanical', 'MEDIUM',
        'Passenger seat mounting bolt below torque spec.',
        'OPEN', op2, now() - interval '6 days'
    );

    -- 10047: stations 1–5 OK, station 6 step 1 NOT_OK + IN_PROGRESS LOW.
    PERFORM pg_temp.mark_stations_ok('1KTSKRV2XSB010047', 5, op1, now() - interval '6 days');
    PERFORM pg_temp.fail_station_step('1KTSKRV2XSB010047', 6, 1, op1, now() - interval '5 days');
    PERFORM pg_temp.add_station_issue(
        '1KTSKRV2XSB010047', 6, 1, 'Trim', 'LOW',
        'Windshield adhesive bead incomplete at the upper-right corner.',
        'IN_PROGRESS', op1, now() - interval '5 days',
        p_process_by => op2, p_process_at => now() - interval '4 days'
    );

    -- ============================================================
    -- Bucket 3: all 64 station steps OK, EoL still BRANCH.
    -- ============================================================
    FOREACH v_vin IN ARRAY branch_complete LOOP
        PERFORM pg_temp.mark_all_stations_ok(v_vin, op1, now() - interval '4 days');
    END LOOP;

    -- 10048: BRANCH EoL mixed — branch-ship soft-warning vehicle.
    PERFORM pg_temp.tick_checklist_range('1KTSKRC2XSB010048', 'EOL', 1, 5, op1, now() - interval '3 days');
    PERFORM pg_temp.tick_checklist_item(
        '1KTSKRC2XSB010048', 'EOL', 6, 'NOT_OK', op2, now() - interval '3 days',
        'Horn inoperative; washer pump dry.'
    );
    PERFORM pg_temp.add_checklist_issue(
        '1KTSKRC2XSB010048', 'EOL_ITEM', 6, 'Electrical', 'CRITICAL',
        'Horn and washer circuit failed during branch EoL.',
        'OPEN', op2, now() - interval '3 days'
    );
    PERFORM pg_temp.tick_checklist_item(
        '1KTSKRC2XSB010048', 'EOL', 7, 'REWORK', op1, now() - interval '2 days',
        'Seat-belt pretensioner connector reseated; awaiting retest.'
    );
    PERFORM pg_temp.add_checklist_issue(
        '1KTSKRC2XSB010048', 'EOL_ITEM', 7, 'Trim', 'MEDIUM',
        'Driver seat-belt pretensioner connector not fully latched.',
        'IN_PROGRESS', op1, now() - interval '2 days',
        p_process_by => op1, p_process_at => now() - interval '36 hours'
    );

    -- 10049: one NOT_OK EoL item whose repair is DONE (quality pending).
    PERFORM pg_temp.tick_checklist_range('1KTSKRV2XSB010049', 'EOL', 1, 8, op2, now() - interval '3 days');
    PERFORM pg_temp.tick_checklist_item(
        '1KTSKRV2XSB010049', 'EOL', 9, 'NOT_OK', op2, now() - interval '2 days',
        'Active U0100 lost-communication DTC on scan.'
    );
    PERFORM pg_temp.add_checklist_issue(
        '1KTSKRV2XSB010049', 'EOL_ITEM', 9, 'Electrical', 'CRITICAL',
        'Lost communication with vehicle control module on EoL scan.',
        'DONE', op2, now() - interval '2 days',
        p_process_by => op1, p_process_at => now() - interval '30 hours',
        p_finish_by => op1, p_finish_at => now() - interval '18 hours',
        p_solution => 'Gateway harness repaired; DTC cleared. Awaiting quality sign-off.'
    );
    PERFORM pg_temp.tick_checklist_item(
        '1KTSKRV2XSB010049', 'SHIPMENT', 11, 'NOT_OK', op1, now() - interval '2 days',
        'Left rear door paint inclusion.'
    );
    PERFORM pg_temp.add_checklist_issue(
        '1KTSKRV2XSB010049', 'SHIPMENT_ITEM', 11, 'Paint', 'LOW',
        'Paint inclusion on left body side, customer-visible.',
        'OPEN', op1, now() - interval '2 days'
    );

    -- 10050: BRANCH EoL items all OK; TEST item OPEN so warning still fires.
    PERFORM pg_temp.tick_checklist_range('1KTSKRC2XSB010050', 'EOL', 1, 9, op1, now() - interval '2 days');
    PERFORM pg_temp.tick_checklist_item(
        '1KTSKRC2XSB010050', 'TEST', 2, 'NOT_OK', op2, now() - interval '2 days',
        'Service brake stopping distance above limit on first run.'
    );
    PERFORM pg_temp.add_checklist_issue(
        '1KTSKRC2XSB010050', 'TEST_ITEM', 2, 'Mechanical', 'MEDIUM',
        'Dynamic service brake performance outside spec.',
        'OPEN', op2, now() - interval '2 days'
    );

    -- ============================================================
    -- Bucket 4: branch-shipped to DEPOT.
    -- 10051/10052: no open issues (depot-release should succeed).
    -- 10053: OPEN + IN_PROGRESS issues (depot-release must hard-block).
    -- ============================================================
    FOREACH v_vin IN ARRAY depot_ready LOOP
        PERFORM pg_temp.mark_all_stations_ok(v_vin, op1, now() - interval '4 days');
        PERFORM pg_temp.tick_checklist_range(v_vin, 'EOL', 1, 9, op1, now() - interval '3 days');
    END LOOP;
    PERFORM pg_temp.mark_all_stations_ok('1KTSKRV2XSB010053', op2, now() - interval '4 days');
    PERFORM pg_temp.tick_checklist_range('1KTSKRV2XSB010053', 'EOL', 1, 9, op2, now() - interval '3 days');

    -- Closed historical issues on 10051 (do not block depot-release).
    PERFORM pg_temp.add_station_issue(
        '1KTSKRV2XSB010051', 2, 7, 'Paint', 'MEDIUM',
        'Clear-coat dust nib on roof — repaired and re-ticked OK.',
        'APPROVED', op1, now() - interval '4 days',
        p_process_by => op1, p_process_at => now() - interval '3 days 12 hours',
        p_finish_by => op2, p_finish_at => now() - interval '3 days',
        p_approve_by => mgr, p_approve_at => now() - interval '2 days 12 hours',
        p_solution => 'Spot repaired, recleared, and signed off by quality.'
    );
    PERFORM pg_temp.tick_checklist_item(
        '1KTSKRV2XSB010051', 'EOL', 14, 'CONDITIONAL_OK', op1, now() - interval '2 days',
        'Tool kit missing wheel chock; accepted for depot with note.'
    );
    PERFORM pg_temp.add_checklist_issue(
        '1KTSKRV2XSB010051', 'EOL_ITEM', 14, 'Trim', 'LOW',
        'Accessory pack missing one wheel chock.',
        'CONDITIONAL_APPROVED', op1, now() - interval '2 days',
        p_process_by => op2, p_process_at => now() - interval '40 hours',
        p_finish_by => op2, p_finish_at => now() - interval '36 hours',
        p_cond_by => mgr, p_cond_at => now() - interval '30 hours',
        p_solution => 'Ship with note; chock to be added at dealer PDI.'
    );
    PERFORM pg_temp.tick_checklist_item(
        '1KTSKRV2XSB010051', 'TEST', 13, 'OK', op2, now() - interval '2 days', NULL
    );
    PERFORM pg_temp.add_checklist_issue(
        '1KTSKRV2XSB010051', 'TEST_ITEM', 13, 'High Voltage', 'CRITICAL',
        'Isolation resistance initially below 100 MΩ; retested after drying.',
        'APPROVED', op2, now() - interval '2 days 6 hours',
        p_process_by => op1, p_process_at => now() - interval '2 days',
        p_finish_by => op1, p_finish_at => now() - interval '40 hours',
        p_approve_by => mgr, p_approve_at => now() - interval '36 hours',
        p_solution => 'Connector dried, retest passed. Full quality approval.'
    );
    PERFORM pg_temp.tick_checklist_item(
        '1KTSKRV2XSB010051', 'SHIPMENT', 39, 'OK', op1, now() - interval '2 days', NULL
    );
    PERFORM pg_temp.add_checklist_issue(
        '1KTSKRV2XSB010051', 'SHIPMENT_ITEM', 39, 'Mechanical', 'MEDIUM',
        'Left-front tyre 4 psi low at customer checklist.',
        'APPROVED', op1, now() - interval '2 days',
        p_process_by => op1, p_process_at => now() - interval '40 hours',
        p_finish_by => op2, p_finish_at => now() - interval '38 hours',
        p_approve_by => mgr, p_approve_at => now() - interval '32 hours',
        p_solution => 'Inflated to spec and rechecked.'
    );
    PERFORM pg_temp.tick_checklist_range('1KTSKRV2XSB010051', 'EOL', 10, 13, op2, now() - interval '20 hours');
    PERFORM pg_temp.tick_checklist_range('1KTSKRC2XSB010052', 'EOL', 10, 16, op1, now() - interval '20 hours');

    -- 10053: the hard-block vehicle — leave OPEN + IN_PROGRESS.
    PERFORM pg_temp.tick_checklist_item(
        '1KTSKRV2XSB010053', 'EOL', 12, 'NOT_OK', op2, now() - interval '20 hours',
        'Visible coolant weep at water-pump housing.'
    );
    PERFORM pg_temp.add_checklist_issue(
        '1KTSKRV2XSB010053', 'EOL_ITEM', 12, 'Mechanical', 'CRITICAL',
        'Coolant leak found during depot fluid inspection.',
        'OPEN', op2, now() - interval '20 hours'
    );
    PERFORM pg_temp.tick_checklist_item(
        '1KTSKRV2XSB010053', 'TEST', 11, 'NOT_OK', op1, now() - interval '18 hours',
        'Active P0A0F DTC on OBD scan at depot.'
    );
    PERFORM pg_temp.add_checklist_issue(
        '1KTSKRV2XSB010053', 'TEST_ITEM', 11, 'Electrical', 'MEDIUM',
        'OBD scan shows active drive-motor DTC at depot.',
        'IN_PROGRESS', op1, now() - interval '18 hours',
        p_process_by => op2, p_process_at => now() - interval '12 hours'
    );

    FOREACH v_vin IN ARRAY depot_ready LOOP
        UPDATE vehicle_eol_workflow
        SET branch_shipped_at = now() - interval '22 hours',
            branch_shipped_by = mgr
        WHERE vehicle_eol_workflow.vin = v_vin;
    END LOOP;
    UPDATE vehicle_eol_workflow
    SET branch_shipped_at = now() - interval '22 hours',
        branch_shipped_by = mgr
    WHERE vin = '1KTSKRV2XSB010053';

    -- ============================================================
    -- Bucket 5: depot released → DOCUMENT. No open issues.
    -- ============================================================
    FOREACH v_vin IN ARRAY document_vins LOOP
        PERFORM pg_temp.mark_all_stations_ok(v_vin, op1, now() - interval '3 days');
        PERFORM pg_temp.tick_all_checklist(v_vin, 'EOL', op2, now() - interval '2 days');
        PERFORM pg_temp.tick_checklist_range(v_vin, 'TEST', 1, 20, op1, now() - interval '2 days');
    END LOOP;

    -- Closed shipment issue on 10054 so Analysis has another CONDITIONAL_APPROVED.
    PERFORM pg_temp.tick_checklist_item(
        '1KTSKRC2XSB010054', 'SHIPMENT', 32, 'CONDITIONAL_OK', op2, now() - interval '2 days',
        'Infotainment speaker rattle at 40% volume; accepted with note.'
    );
    PERFORM pg_temp.add_checklist_issue(
        '1KTSKRC2XSB010054', 'SHIPMENT_ITEM', 32, 'Electrical', 'LOW',
        'Infotainment speaker rattle on customer checklist.',
        'CONDITIONAL_APPROVED', op2, now() - interval '2 days',
        p_process_by => op1, p_process_at => now() - interval '36 hours',
        p_finish_by => op1, p_finish_at => now() - interval '30 hours',
        p_cond_by => mgr, p_cond_at => now() - interval '24 hours',
        p_solution => 'Cannot duplicate at other volumes; ship with dealer follow-up.'
    );

    FOREACH v_vin IN ARRAY document_vins LOOP
        UPDATE vehicle_eol_workflow
        SET branch_shipped_at = now() - interval '40 hours',
            branch_shipped_by = mgr
        WHERE vehicle_eol_workflow.vin = v_vin;
        UPDATE vehicle_eol_workflow
        SET depot_released_at = now() - interval '18 hours',
            depot_released_by = mgr
        WHERE vehicle_eol_workflow.vin = v_vin;
    END LOOP;

    -- 10056: complete the customer checklist so IN_WAREHOUSE → WITH_CUSTOMER.
    PERFORM pg_temp.tick_all_checklist('1KTSKRC2XSB010056', 'SHIPMENT', op1, now() - interval '10 hours');

    -- ============================================================
    -- Bucket 6: document approved → COMPLETED / SHIPPED.
    -- ============================================================
    FOREACH v_vin IN ARRAY shipped LOOP
        PERFORM pg_temp.mark_all_stations_ok(v_vin, op2, now() - interval '2 days');
        PERFORM pg_temp.tick_all_checklist(v_vin, 'EOL', op1, now() - interval '36 hours');
        PERFORM pg_temp.tick_checklist_range(v_vin, 'TEST', 1, 45, op2, now() - interval '30 hours');
        UPDATE vehicle_eol_workflow
        SET branch_shipped_at = now() - interval '30 hours',
            branch_shipped_by = mgr
        WHERE vehicle_eol_workflow.vin = v_vin;
        -- Shipment after branch-ship so IN_WAREHOUSE can flip to WITH_CUSTOMER
        -- before document approval overwrites the status to SHIPPED.
        PERFORM pg_temp.tick_checklist_range(v_vin, 'SHIPMENT', 1, 43, op1, now() - interval '28 hours');
        UPDATE vehicle_eol_workflow
        SET depot_released_at = now() - interval '20 hours',
            depot_released_by = mgr
        WHERE vehicle_eol_workflow.vin = v_vin;
        UPDATE vehicle_eol_workflow
        SET document_approved_at = now() - interval '8 hours',
            document_approved_by = mgr
        WHERE vehicle_eol_workflow.vin = v_vin;
    END LOOP;

    -- Extra DONE TEST issue on a shipped vehicle (already closed via... wait,
    -- DONE would have blocked depot-release. Keep this one APPROVED.
    -- Already covered. Add a DONE issue on 10047 (still IN_PRODUCTION) for
    -- the Analysis "pending quality" view — TEST_ITEM DONE LOW.
    PERFORM pg_temp.tick_checklist_item(
        '1KTSKRV2XSB010047', 'TEST', 8, 'NOT_OK', op2, now() - interval '4 days',
        'Low-beam cutoff 0.4° high on left lamp.'
    );
    PERFORM pg_temp.add_checklist_issue(
        '1KTSKRV2XSB010047', 'TEST_ITEM', 8, 'Electrical', 'LOW',
        'Left headlamp aim out of spec during test.',
        'DONE', op2, now() - interval '4 days',
        p_process_by => op1, p_process_at => now() - interval '3 days',
        p_finish_by => op1, p_finish_at => now() - interval '2 days 12 hours',
        p_solution => 'Aim adjusted; retest pending quality decision.'
    );
END $$;

COMMIT;
