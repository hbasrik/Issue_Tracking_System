-- =====================================================================
-- Reverse KAREA v2 architecture back to the 0001 schema shape.
-- NOTE: Any v2-only data (EOL workflow stage history, media_attachments,
-- TEST checklist progress, CONDITIONAL_APPROVED issues, etc.) is lost on
-- rollback. Expected/acceptable at this pre-production stage.
-- =====================================================================

-- Views (v2 + shared)
DROP VIEW IF EXISTS vw_eol_workflow_funnel;
DROP VIEW IF EXISTS vw_vehicle_completion_split;
DROP VIEW IF EXISTS vw_issues_pending_quality_approval;
DROP VIEW IF EXISTS vw_vehicle_open_issue_severity_breakdown;
DROP VIEW IF EXISTS vw_issue_mttr;
DROP VIEW IF EXISTS vw_defect_rate_per_station;
DROP VIEW IF EXISTS vw_completed_issues_daily;
DROP VIEW IF EXISTS vw_daily_pending_issues;

-- v2 triggers
DROP TRIGGER IF EXISTS trg_link_latest_issue_to_source ON issue_list;
DROP TRIGGER IF EXISTS trg_enforce_manual_status_change ON vehicles;
DROP TRIGGER IF EXISTS trg_check_shipment_completion ON checklist_item_progress;
DROP TRIGGER IF EXISTS trg_enforce_document_approval ON vehicle_eol_workflow;
DROP TRIGGER IF EXISTS trg_enforce_depot_release ON vehicle_eol_workflow;
DROP TRIGGER IF EXISTS trg_enforce_branch_shipment ON vehicle_eol_workflow;
DROP TRIGGER IF EXISTS trg_recalculate_vehicle_progress ON vehicle_station_step_progress;
DROP TRIGGER IF EXISTS trg_initialize_vehicle_progress ON vehicles;
DROP TRIGGER IF EXISTS trg_assign_checklist_templates ON vehicles;
DROP TRIGGER IF EXISTS trg_eol_workflow_updated_at ON vehicle_eol_workflow;
DROP TRIGGER IF EXISTS trg_cip_updated_at ON checklist_item_progress;
DROP TRIGGER IF EXISTS trg_vssp_updated_at ON vehicle_station_step_progress;
DROP TRIGGER IF EXISTS trg_issue_list_updated_at ON issue_list;
DROP TRIGGER IF EXISTS trg_vehicles_updated_at ON vehicles;

DROP FUNCTION IF EXISTS fn_link_latest_issue_to_source();
DROP FUNCTION IF EXISTS fn_enforce_manual_status_change();
DROP FUNCTION IF EXISTS fn_check_shipment_completion();
DROP FUNCTION IF EXISTS fn_enforce_document_approval();
DROP FUNCTION IF EXISTS fn_enforce_depot_release();
DROP FUNCTION IF EXISTS fn_enforce_branch_shipment();
DROP FUNCTION IF EXISTS fn_recalculate_vehicle_progress();
DROP FUNCTION IF EXISTS fn_initialize_vehicle_progress();
DROP FUNCTION IF EXISTS fn_assign_checklist_templates();

-- Clear data that cannot survive the reshape
TRUNCATE TABLE audit_logs RESTART IDENTITY CASCADE;
TRUNCATE TABLE media_attachments RESTART IDENTITY CASCADE;
TRUNCATE TABLE vehicle_eol_workflow CASCADE;
TRUNCATE TABLE checklist_item_progress RESTART IDENTITY CASCADE;
TRUNCATE TABLE vehicle_station_step_progress RESTART IDENTITY CASCADE;
TRUNCATE TABLE issue_list RESTART IDENTITY CASCADE;
TRUNCATE TABLE vehicles CASCADE;

DROP TABLE IF EXISTS media_attachments;
DROP TABLE IF EXISTS vehicle_eol_workflow;
DROP TABLE IF EXISTS checklist_item_progress;
DROP TABLE IF EXISTS vehicle_station_step_progress;

DROP INDEX IF EXISTS idx_vssp_vin_station;
DROP INDEX IF EXISTS idx_vssp_station_step;
DROP INDEX IF EXISTS idx_vssp_checked_at;
DROP INDEX IF EXISTS idx_cip_vin_type;
DROP INDEX IF EXISTS idx_cip_status;
DROP INDEX IF EXISTS idx_eol_workflow_stage;
DROP INDEX IF EXISTS idx_media_attachments_entity;
DROP INDEX IF EXISTS idx_role_permissions_permission;
DROP INDEX IF EXISTS idx_vehicles_vehicle_number;
DROP INDEX IF EXISTS idx_vehicles_current_station;
DROP INDEX IF EXISTS idx_issue_list_open_by_vin;

-- Detach FKs to station_steps / stations before drop
ALTER TABLE issue_list DROP CONSTRAINT IF EXISTS chk_issue_source;
ALTER TABLE issue_list DROP CONSTRAINT IF EXISTS chk_conditional_approve_pair;
ALTER TABLE issue_list DROP COLUMN IF EXISTS source_station_step_id;
ALTER TABLE issue_list DROP COLUMN IF EXISTS conditional_approve_reporter_id;
ALTER TABLE issue_list DROP COLUMN IF EXISTS conditional_approve_date;
UPDATE issue_list SET station_id = NULL;
UPDATE checklist_template_items SET station_id = NULL;
ALTER TABLE issue_list DROP CONSTRAINT IF EXISTS issue_list_station_id_fkey;
ALTER TABLE checklist_template_items DROP CONSTRAINT IF EXISTS checklist_template_items_station_id_fkey;
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_station_id_fkey;
ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS vehicles_current_station_id_fkey;

DROP TABLE IF EXISTS station_steps;
DROP TABLE IF EXISTS stations;

-- Restore phases + v1 stations + checkpoints
CREATE TABLE phases (
    phase_number  SMALLINT PRIMARY KEY CHECK (phase_number BETWEEN 1 AND 8),
    name          VARCHAR(100) NOT NULL
);

CREATE TABLE stations (
    id            SERIAL PRIMARY KEY,
    name          VARCHAR(100) NOT NULL,
    phase_number  SMALLINT REFERENCES phases(phase_number)
);

CREATE TABLE checkpoints (
    id            SERIAL PRIMARY KEY,
    phase_number  SMALLINT NOT NULL REFERENCES phases(phase_number),
    station_id    INT REFERENCES stations(id),
    sequence_no   SMALLINT NOT NULL,
    name          VARCHAR(150) NOT NULL,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (phase_number, sequence_no)
);

CREATE TYPE checkpoint_status_enum AS ENUM (
    'PENDING',
    'OK',
    'NOT_OK'
);

ALTER TABLE checklist_template_items
    ADD CONSTRAINT checklist_template_items_station_id_fkey
    FOREIGN KEY (station_id) REFERENCES stations(id);
ALTER TABLE issue_list
    ADD CONSTRAINT issue_list_station_id_fkey
    FOREIGN KEY (station_id) REFERENCES stations(id);
ALTER TABLE audit_logs
    ADD CONSTRAINT audit_logs_station_id_fkey
    FOREIGN KEY (station_id) REFERENCES stations(id);

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS phase_number SMALLINT REFERENCES phases(phase_number);

-- vehicles: remove v2 columns, restore current_phase
ALTER TABLE vehicles DROP COLUMN IF EXISTS vehicle_number;
ALTER TABLE vehicles DROP COLUMN IF EXISTS current_station_id;
ALTER TABLE vehicles DROP COLUMN IF EXISTS test_template_id;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS current_phase SMALLINT NOT NULL DEFAULT 1;
ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS vehicles_current_phase_check;
ALTER TABLE vehicles ADD CONSTRAINT vehicles_current_phase_check CHECK (current_phase BETWEEN 1 AND 8);

COMMENT ON COLUMN vehicles.current_global_status IS
    'Auto-transitioned by triggers: IN_PRODUCTION -> IN_WAREHOUSE when phase 8 + EoL gate complete, '
    'IN_WAREHOUSE -> WITH_CUSTOMER when the shipment checklist is fully OK/CONDITIONAL_OK. '
    'Manual override is allowed for MANAGER_ADMIN via the web dashboard.';

-- checklist_template_items: drop eol_phase
ALTER TABLE checklist_template_items DROP COLUMN IF EXISTS eol_phase;

-- Restore enums to v1
ALTER TABLE checklist_templates ALTER COLUMN type TYPE text;
-- Drop TEST templates before shrinking enum
DELETE FROM checklist_templates WHERE type = 'TEST';
DROP TYPE checklist_type_enum;
CREATE TYPE checklist_type_enum AS ENUM ('EOL', 'SHIPMENT');
ALTER TABLE checklist_templates
    ALTER COLUMN type TYPE checklist_type_enum USING type::checklist_type_enum;

ALTER TABLE issue_list ALTER COLUMN status DROP DEFAULT;
ALTER TABLE issue_list ALTER COLUMN status TYPE text;
DELETE FROM issue_list WHERE status = 'CONDITIONAL_APPROVED';
DROP TYPE issue_status_enum;
CREATE TYPE issue_status_enum AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE', 'APPROVED');
ALTER TABLE issue_list
    ALTER COLUMN status TYPE issue_status_enum USING status::issue_status_enum;
ALTER TABLE issue_list ALTER COLUMN status SET DEFAULT 'OPEN';

ALTER TABLE issue_list ALTER COLUMN source_type TYPE text;
UPDATE issue_list SET source_type = 'PHASE_CHECKPOINT' WHERE source_type = 'STATION_STEP';
DELETE FROM issue_list WHERE source_type = 'TEST_ITEM';
DROP TYPE issue_source_enum;
CREATE TYPE issue_source_enum AS ENUM ('PHASE_CHECKPOINT', 'EOL_ITEM', 'SHIPMENT_ITEM');
ALTER TABLE issue_list
    ALTER COLUMN source_type TYPE issue_source_enum USING source_type::issue_source_enum;

ALTER TABLE issue_list ADD COLUMN IF NOT EXISTS source_checkpoint_id INT REFERENCES checkpoints(id);
ALTER TABLE issue_list ADD CONSTRAINT chk_issue_source CHECK (
    (source_type = 'PHASE_CHECKPOINT' AND source_checkpoint_id IS NOT NULL AND source_check_item_id IS NULL)
    OR
    (source_type IN ('EOL_ITEM', 'SHIPMENT_ITEM') AND source_check_item_id IS NOT NULL AND source_checkpoint_id IS NULL)
);

ALTER TABLE audit_logs ALTER COLUMN event_type TYPE text;
DROP TYPE audit_event_enum;
CREATE TYPE audit_event_enum AS ENUM (
    'STATUS_CHANGE',
    'LOCATION_CHANGE',
    'PHASE_ENTER',
    'PHASE_EXIT',
    'STATION_ENTER',
    'STATION_EXIT',
    'CHECKLIST_ITEM_UPDATE',
    'ISSUE_STATUS_CHANGE'
);
ALTER TABLE audit_logs
    ALTER COLUMN event_type TYPE audit_event_enum USING event_type::audit_event_enum;

DROP TYPE IF EXISTS station_step_status_enum;
DROP TYPE IF EXISTS eol_item_phase_enum;
DROP TYPE IF EXISTS eol_workflow_stage_enum;

-- users: role_id -> role enum
CREATE TYPE user_role_enum AS ENUM ('OPERATOR', 'MANAGER_ADMIN');
ALTER TABLE users ADD COLUMN IF NOT EXISTS role user_role_enum;
UPDATE users u SET role = r.code::user_role_enum
FROM roles r WHERE r.id = u.role_id;
UPDATE users SET role = 'OPERATOR' WHERE role IS NULL;
ALTER TABLE users ALTER COLUMN role SET NOT NULL;
ALTER TABLE users DROP COLUMN IF EXISTS role_id;

DROP TABLE IF EXISTS role_permissions;
DROP TABLE IF EXISTS permissions;
DROP TABLE IF EXISTS roles;

-- Restore v1 progress tables
CREATE TABLE production_phase_progress (
    id                BIGSERIAL PRIMARY KEY,
    vin               VARCHAR(17) NOT NULL REFERENCES vehicles(vin) ON DELETE CASCADE,
    phase_number      SMALLINT NOT NULL REFERENCES phases(phase_number),
    checkpoint_id     INT NOT NULL REFERENCES checkpoints(id),
    status            checkpoint_status_enum NOT NULL DEFAULT 'PENDING',
    checked_by        INT REFERENCES users(id),
    checked_at        TIMESTAMPTZ,
    related_issue_id  BIGINT REFERENCES issue_list(id),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (vin, checkpoint_id)
);

CREATE TABLE eol_and_shipment_checklist_progress (
    id                BIGSERIAL PRIMARY KEY,
    vin               VARCHAR(17) NOT NULL REFERENCES vehicles(vin) ON DELETE CASCADE,
    checklist_type    checklist_type_enum NOT NULL,
    check_item_id     INT NOT NULL REFERENCES checklist_template_items(id),
    check_status      check_status_enum NOT NULL DEFAULT 'PENDING',
    checker_id        INT REFERENCES users(id),
    check_date        TIMESTAMPTZ,
    check_image_url   TEXT,
    rework_desc       TEXT,
    rework_date       TIMESTAMPTZ,
    conditional_desc  TEXT,
    conditional_date  TIMESTAMPTZ,
    rejected_desc     TEXT,
    rejected_date     TIMESTAMPTZ,
    rejected_by       INT REFERENCES users(id),
    approved_desc     TEXT,
    approved_date     TIMESTAMPTZ,
    approved_by       INT REFERENCES users(id),
    related_issue_id  BIGINT REFERENCES issue_list(id),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (vin, check_item_id),
    CONSTRAINT chk_description_required_by_status CHECK (
        check_status IN ('PENDING', 'OK')
        OR (check_status = 'NOT_OK' AND rejected_desc IS NOT NULL)
        OR (check_status = 'REWORK' AND rework_desc IS NOT NULL)
        OR (check_status = 'CONDITIONAL_OK' AND conditional_desc IS NOT NULL)
    )
);

-- v1 indexes
CREATE INDEX IF NOT EXISTS idx_ppp_vin_phase ON production_phase_progress (vin, phase_number);
CREATE INDEX IF NOT EXISTS idx_ppp_checkpoint ON production_phase_progress (checkpoint_id);
CREATE INDEX IF NOT EXISTS idx_ppp_checked_at ON production_phase_progress (checked_at);
CREATE INDEX IF NOT EXISTS idx_eol_ship_vin_type ON eol_and_shipment_checklist_progress (vin, checklist_type);
CREATE INDEX IF NOT EXISTS idx_eol_ship_status ON eol_and_shipment_checklist_progress (vin, checklist_type, check_status);
CREATE INDEX idx_issue_list_open_by_vin ON issue_list (vin, severity) WHERE status IN ('OPEN', 'IN_PROGRESS');

-- Restore v1 default templates
DELETE FROM checklist_templates
WHERE vehicle_model_id IS NULL
  AND name IN (
      'Default EoL Template (16 items, Branch + Depot)',
      'Default Customer Vehicle Checklist (43 items)',
      'Default Test Checklist (45 items)',
      'Default EoL Template (13 items)',
      'Default Shipment Template (43 items)'
  );

INSERT INTO phases (phase_number, name) VALUES
    (1, 'Phase 1'), (2, 'Phase 2'), (3, 'Phase 3'), (4, 'Phase 4'),
    (5, 'Phase 5'), (6, 'Phase 6'), (7, 'Phase 7'), (8, 'Phase 8');

INSERT INTO checklist_templates (vehicle_model_id, type, name, is_active) VALUES
    (NULL, 'EOL', 'Default EoL Template (13 items)', TRUE),
    (NULL, 'SHIPMENT', 'Default Shipment Template (43 items)', TRUE);

-- =====================================================================
-- SECTION 9: FUNCTIONS & TRIGGERS
-- =====================================================================

-- --- Generic updated_at maintenance -------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_vehicles_updated_at
    BEFORE UPDATE ON vehicles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_issue_list_updated_at
    BEFORE UPDATE ON issue_list
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_ppp_updated_at
    BEFORE UPDATE ON production_phase_progress
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_eol_ship_updated_at
    BEFORE UPDATE ON eol_and_shipment_checklist_progress
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- --- Auto-assign checklist templates on vehicle creation ----------------
-- Multi-template rule (Decision Log #3): pick the model-specific
-- template if one is active, otherwise fall back to the generic default
-- (vehicle_model_id IS NULL) template of the same type.
CREATE OR REPLACE FUNCTION fn_assign_checklist_templates()
RETURNS TRIGGER AS $$
DECLARE
    v_eol_template_id INT;
    v_shipment_template_id INT;
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

    NEW.eol_template_id := v_eol_template_id;
    NEW.shipment_template_id := v_shipment_template_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_assign_checklist_templates
    BEFORE INSERT ON vehicles
    FOR EACH ROW EXECUTE FUNCTION fn_assign_checklist_templates();

-- --- Materialize checkpoint / checklist rows for a new vehicle ----------
-- Copies the active checkpoint catalogue and the two assigned templates
-- into vehicle-scoped progress rows so the mobile app always has a
-- concrete row to tick against (status = PENDING).
CREATE OR REPLACE FUNCTION fn_initialize_vehicle_progress()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO production_phase_progress (vin, phase_number, checkpoint_id, status)
    SELECT NEW.vin, c.phase_number, c.id, 'PENDING'
    FROM checkpoints c
    WHERE c.is_active = TRUE;

    INSERT INTO eol_and_shipment_checklist_progress (vin, checklist_type, check_item_id, check_status)
    SELECT NEW.vin, 'EOL', cti.id, 'PENDING'
    FROM checklist_template_items cti
    WHERE cti.template_id = NEW.eol_template_id AND cti.is_active = TRUE;

    INSERT INTO eol_and_shipment_checklist_progress (vin, checklist_type, check_item_id, check_status)
    SELECT NEW.vin, 'SHIPMENT', cti.id, 'PENDING'
    FROM checklist_template_items cti
    WHERE cti.template_id = NEW.shipment_template_id AND cti.is_active = TRUE;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_initialize_vehicle_progress
    AFTER INSERT ON vehicles
    FOR EACH ROW EXECUTE FUNCTION fn_initialize_vehicle_progress();

-- --- Recalculate completion %, current_phase and auto status change ----
-- Soft-warning rule (Decision Log #2): a NOT_OK checkpoint never blocks
-- progress into the next phase, it is simply excluded from the
-- percentage until its linked issue is resolved and the item re-ticked.
CREATE OR REPLACE FUNCTION fn_recalculate_vehicle_progress()
RETURNS TRIGGER AS $$
DECLARE
    v_total INT;
    v_done INT;
    v_new_percentage NUMERIC(5,2);
    v_new_phase SMALLINT;
    v_eol_gate_passed BOOLEAN;
BEGIN
    SELECT count(*), count(*) FILTER (WHERE status = 'OK')
    INTO v_total, v_done
    FROM production_phase_progress
    WHERE vin = NEW.vin;

    v_new_percentage := CASE WHEN v_total = 0 THEN 0 ELSE round((v_done::NUMERIC / v_total) * 100, 2) END;

    -- lowest phase that is not fully OK yet; 8 if everything is complete
    SELECT COALESCE(MIN(phase_number), 8) INTO v_new_phase
    FROM production_phase_progress
    WHERE vin = NEW.vin AND status <> 'OK';

    UPDATE vehicles
    SET total_progress_percentage = v_new_percentage,
        current_phase = v_new_phase
    WHERE vin = NEW.vin;

    -- Auto status transition: IN_PRODUCTION -> IN_WAREHOUSE
    -- Requires ALL 8 phases complete AND the EoL hard-block gate passed
    -- (all EoL items OK/CONDITIONAL_OK) — see architecture notes for the
    -- reasoning behind combining these two Decision Log rules.
    IF v_done = v_total THEN
        SELECT NOT EXISTS (
            SELECT 1 FROM eol_and_shipment_checklist_progress
            WHERE vin = NEW.vin AND checklist_type = 'EOL'
              AND check_status NOT IN ('OK', 'CONDITIONAL_OK')
        ) INTO v_eol_gate_passed;

        IF v_eol_gate_passed THEN
            UPDATE vehicles
            SET current_global_status = 'IN_WAREHOUSE'
            WHERE vin = NEW.vin AND current_global_status = 'IN_PRODUCTION';

            IF FOUND THEN
                INSERT INTO audit_logs (vin, event_type, old_value, new_value, metadata)
                VALUES (NEW.vin, 'STATUS_CHANGE', 'IN_PRODUCTION', 'IN_WAREHOUSE',
                        jsonb_build_object('trigger', 'phase_8_and_eol_gate_complete'));
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_recalculate_vehicle_progress
    AFTER INSERT OR UPDATE OF status ON production_phase_progress
    FOR EACH ROW EXECUTE FUNCTION fn_recalculate_vehicle_progress();

-- Re-evaluate the EoL gate whenever an EoL item changes too (covers the
-- case where phase 8 finished earlier but EoL was completed afterwards).
CREATE OR REPLACE FUNCTION fn_recheck_eol_gate_on_item_update()
RETURNS TRIGGER AS $$
DECLARE
    v_eol_gate_passed BOOLEAN;
    v_phase8_complete BOOLEAN;
BEGIN
    IF NEW.checklist_type <> 'EOL' THEN
        RETURN NEW;
    END IF;

    SELECT NOT EXISTS (
        SELECT 1 FROM eol_and_shipment_checklist_progress
        WHERE vin = NEW.vin AND checklist_type = 'EOL'
          AND check_status NOT IN ('OK', 'CONDITIONAL_OK')
    ) INTO v_eol_gate_passed;

    SELECT NOT EXISTS (
        SELECT 1 FROM production_phase_progress
        WHERE vin = NEW.vin AND status <> 'OK'
    ) INTO v_phase8_complete;

    IF v_eol_gate_passed AND v_phase8_complete THEN
        UPDATE vehicles
        SET current_global_status = 'IN_WAREHOUSE'
        WHERE vin = NEW.vin AND current_global_status = 'IN_PRODUCTION';

        IF FOUND THEN
            INSERT INTO audit_logs (vin, event_type, old_value, new_value, metadata)
            VALUES (NEW.vin, 'STATUS_CHANGE', 'IN_PRODUCTION', 'IN_WAREHOUSE',
                    jsonb_build_object('trigger', 'eol_gate_complete_after_phase_8'));
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_recheck_eol_gate
    AFTER INSERT OR UPDATE OF check_status ON eol_and_shipment_checklist_progress
    FOR EACH ROW EXECUTE FUNCTION fn_recheck_eol_gate_on_item_update();

-- --- Auto status transition: IN_WAREHOUSE -> WITH_CUSTOMER --------------
-- Hard-block rule (Decision Log #4/#5, PRD FR-4.3): ALL shipment
-- checklist items for the vehicle must be OK or CONDITIONAL_OK.
CREATE OR REPLACE FUNCTION fn_check_shipment_completion()
RETURNS TRIGGER AS $$
DECLARE
    v_all_passed BOOLEAN;
BEGIN
    IF NEW.checklist_type <> 'SHIPMENT' THEN
        RETURN NEW;
    END IF;

    SELECT NOT EXISTS (
        SELECT 1 FROM eol_and_shipment_checklist_progress
        WHERE vin = NEW.vin AND checklist_type = 'SHIPMENT'
          AND check_status NOT IN ('OK', 'CONDITIONAL_OK')
    ) INTO v_all_passed;

    IF v_all_passed THEN
        UPDATE vehicles
        SET current_global_status = 'WITH_CUSTOMER'
        WHERE vin = NEW.vin AND current_global_status = 'IN_WAREHOUSE';

        IF FOUND THEN
            INSERT INTO audit_logs (vin, event_type, old_value, new_value, metadata)
            VALUES (NEW.vin, 'STATUS_CHANGE', 'IN_WAREHOUSE', 'WITH_CUSTOMER',
                    jsonb_build_object('trigger', 'shipment_checklist_complete'));
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_shipment_completion
    AFTER INSERT OR UPDATE OF check_status ON eol_and_shipment_checklist_progress
    FOR EACH ROW EXECUTE FUNCTION fn_check_shipment_completion();

-- --- Defense-in-depth: reject manual/API status changes that bypass ----
-- the hard-block rules above, even if attempted directly (PRD FR-3.6 /
-- FR-4.3 "even a direct API call must be rejected").
CREATE OR REPLACE FUNCTION fn_enforce_manual_status_change()
RETURNS TRIGGER AS $$
DECLARE
    v_shipment_incomplete BOOLEAN;
BEGIN
    IF NEW.current_global_status = OLD.current_global_status THEN
        RETURN NEW;
    END IF;

    IF NEW.current_global_status IN ('WITH_CUSTOMER', 'SHIPPED') THEN
        SELECT EXISTS (
            SELECT 1 FROM eol_and_shipment_checklist_progress
            WHERE vin = NEW.vin AND checklist_type = 'SHIPMENT'
              AND check_status NOT IN ('OK', 'CONDITIONAL_OK')
        ) INTO v_shipment_incomplete;

        IF v_shipment_incomplete THEN
            RAISE EXCEPTION 'Cannot move vehicle % to % — shipment checklist is not fully OK/CONDITIONAL_OK', NEW.vin, NEW.current_global_status;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_manual_status_change
    BEFORE UPDATE OF current_global_status ON vehicles
    FOR EACH ROW EXECUTE FUNCTION fn_enforce_manual_status_change();

-- --- Auto-link a failed checkpoint/checklist item to its issue ----------
-- When an operator submits the "Hata Bildir" form, the application layer
-- inserts into issue_list first, then updates the source row's
-- related_issue_id. This trigger is a safety net that fills it in
-- automatically if the application forgets to.
CREATE OR REPLACE FUNCTION fn_link_latest_issue_to_source()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.source_type = 'PHASE_CHECKPOINT' THEN
        UPDATE production_phase_progress
        SET related_issue_id = NEW.id
        WHERE vin = NEW.vin AND checkpoint_id = NEW.source_checkpoint_id
          AND related_issue_id IS NULL;
    ELSE
        UPDATE eol_and_shipment_checklist_progress
        SET related_issue_id = NEW.id
        WHERE vin = NEW.vin AND check_item_id = NEW.source_check_item_id
          AND related_issue_id IS NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_link_latest_issue_to_source
    AFTER INSERT ON issue_list
    FOR EACH ROW EXECUTE FUNCTION fn_link_latest_issue_to_source();

-- =====================================================================
-- SECTION 10: ANALYSIS VIEWS (feed the web "Analysis" tab / Pie & Bar charts)
-- =====================================================================

-- Daily Pending Issues — trend line + KPI card
CREATE OR REPLACE VIEW vw_daily_pending_issues AS
SELECT date_trunc('day', issue_date)::date AS day,
       count(*) FILTER (WHERE status IN ('OPEN', 'IN_PROGRESS', 'DONE')) AS pending_count
FROM issue_list
GROUP BY 1
ORDER BY 1;

-- Completed Issues — daily/weekly
CREATE OR REPLACE VIEW vw_completed_issues_daily AS
SELECT date_trunc('day', finish_date)::date AS day,
       count(*) AS completed_count
FROM issue_list
WHERE finish_date IS NOT NULL
GROUP BY 1
ORDER BY 1;

-- Defect Rate per Station
CREATE OR REPLACE VIEW vw_defect_rate_per_station AS
SELECT s.id AS station_id,
       s.name AS station_name,
       count(DISTINCT il.vin) AS vehicles_with_issue,
       count(il.id) AS issue_count
FROM stations s
LEFT JOIN issue_list il ON il.station_id = s.id
GROUP BY s.id, s.name;

-- Cycle Time / MTTR (issue open -> finish)
CREATE OR REPLACE VIEW vw_issue_mttr AS
SELECT station_id,
       avg(finish_date - issue_date) AS mean_time_to_resolve
FROM issue_list
WHERE finish_date IS NOT NULL
GROUP BY station_id;

-- Araç Bazlı Açık Hata Dağılımı (VIN x Severity) — Decision Log #7
CREATE OR REPLACE VIEW vw_vehicle_open_issue_severity_breakdown AS
SELECT vin,
       count(*) AS total_open_issues,
       count(*) FILTER (WHERE severity = 'CRITICAL') AS critical_count,
       count(*) FILTER (WHERE severity = 'MEDIUM') AS medium_count,
       count(*) FILTER (WHERE severity = 'LOW') AS low_count
FROM issue_list
WHERE status IN ('OPEN', 'IN_PROGRESS', 'DONE')
GROUP BY vin
ORDER BY total_open_issues DESC;

-- Kalite Onay Kuyrugu — issues repaired (DONE) but awaiting quality/manager
-- APPROVED sign-off. Oldest finished first so the queue is FIFO.
CREATE OR REPLACE VIEW vw_issues_pending_quality_approval AS
SELECT id,
       vin,
       severity,
       finish_date,
       finish_reporter_id
FROM issue_list
WHERE status = 'DONE'
ORDER BY finish_date ASC;

-- Biten / Devam Eden İşler (Pie chart source) — vehicle completion split
CREATE OR REPLACE VIEW vw_vehicle_completion_split AS
SELECT count(*) FILTER (WHERE total_progress_percentage >= 100) AS completed_vehicles,
       count(*) FILTER (WHERE total_progress_percentage < 100) AS in_progress_vehicles
FROM vehicles;

