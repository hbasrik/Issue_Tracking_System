-- =====================================================================
-- KAREA — Integrated Production Tracking & Monitoring Platform
-- PostgreSQL Database Schema (DDL) — v1.0
-- Reference: 01_KAREA_PRD.md (Decision Log), 07_KAREA_UIUX_Tasarim_Rehberi.md
-- All identifiers and comments are in English per Clean Code convention.
-- =====================================================================

-- =====================================================================
-- SECTION 0: EXTENSIONS
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;      -- trigram search for partial VIN lookup
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";  -- reserved for future UUID-based entities

-- =====================================================================
-- SECTION 1: ENUM TYPES
-- =====================================================================

CREATE TYPE user_role_enum AS ENUM (
    'OPERATOR',       -- mobile only: fills phases/checklists, reports issues
    'MANAGER_ADMIN'   -- web only: full tracking, status updates, issue closing
);

CREATE TYPE vehicle_status_enum AS ENUM (
    'IN_PRODUCTION',  -- Hatta
    'IN_WAREHOUSE',   -- Depoda
    'WITH_CUSTOMER',  -- Musteride
    'SHIPPED',        -- Sevk edildi (final logistics state, post WITH_CUSTOMER handoff)
    'ON_HOLD'         -- manual exception state
);

CREATE TYPE checkpoint_status_enum AS ENUM (
    'PENDING',
    'OK',
    'NOT_OK'
);

CREATE TYPE check_status_enum AS ENUM (
    'PENDING',
    'OK',
    'NOT_OK',
    'REWORK',
    'CONDITIONAL_OK'
);

CREATE TYPE checklist_type_enum AS ENUM (
    'EOL',
    'SHIPMENT'
);

CREATE TYPE issue_status_enum AS ENUM (
    'OPEN',
    'IN_PROGRESS',
    'DONE'
);

CREATE TYPE issue_severity_enum AS ENUM (
    'CRITICAL',
    'MEDIUM',
    'LOW'
);

CREATE TYPE issue_source_enum AS ENUM (
    'PHASE_CHECKPOINT',
    'EOL_ITEM',
    'SHIPMENT_ITEM'
);

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

-- =====================================================================
-- SECTION 2: REFERENCE / MASTER TABLES
-- =====================================================================

CREATE TABLE users (
    id            SERIAL PRIMARY KEY,
    full_name     VARCHAR(150) NOT NULL,
    email         VARCHAR(200) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,  -- bcrypt hash, never store or return plaintext
    role          user_role_enum NOT NULL,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE vehicle_models (
    id            SERIAL PRIMARY KEY,
    name          VARCHAR(100) NOT NULL UNIQUE,
    code          VARCHAR(30) NOT NULL UNIQUE,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE phases (
    phase_number  SMALLINT PRIMARY KEY CHECK (phase_number BETWEEN 1 AND 8),
    name          VARCHAR(100) NOT NULL
);

CREATE TABLE stations (
    id            SERIAL PRIMARY KEY,
    name          VARCHAR(100) NOT NULL,
    phase_number  SMALLINT REFERENCES phases(phase_number)
    -- nullable: some stations (e.g. EoL, Shipment bay) do not map 1:1 to a production phase
);

-- Master checkpoint catalogue (the 7-8 items per phase). Vehicle-specific
-- progress is tracked separately in production_phase_progress so this table
-- stays a small, stable reference set even as vehicle volume grows.
CREATE TABLE checkpoints (
    id            SERIAL PRIMARY KEY,
    phase_number  SMALLINT NOT NULL REFERENCES phases(phase_number),
    station_id    INT REFERENCES stations(id),
    sequence_no   SMALLINT NOT NULL,
    name          VARCHAR(150) NOT NULL,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (phase_number, sequence_no)
);

-- Issue category catalogue (e.g. Electrical, Paint, Trim) used for
-- "hata turu" filtering in the Analysis tab.
CREATE TABLE issue_types (
    id            SERIAL PRIMARY KEY,
    name          VARCHAR(100) NOT NULL UNIQUE
);

-- Multi-template architecture (Decision Log #3): EoL and Shipment
-- checklists can differ per vehicle model instead of being hard-coded.
CREATE TABLE checklist_templates (
    id                SERIAL PRIMARY KEY,
    vehicle_model_id  INT REFERENCES vehicle_models(id),  -- NULL = generic/default template
    type              checklist_type_enum NOT NULL,
    name              VARCHAR(150) NOT NULL,
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE checklist_template_items (
    id            SERIAL PRIMARY KEY,
    template_id   INT NOT NULL REFERENCES checklist_templates(id) ON DELETE CASCADE,
    item_no       SMALLINT NOT NULL,
    item_text     VARCHAR(250) NOT NULL,
    station_id    INT REFERENCES stations(id),
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (template_id, item_no)
);

-- =====================================================================
-- SECTION 3: CORE TABLE — vehicles (Master Vehicle Identity Table)
-- =====================================================================

CREATE TABLE vehicles (
    vin                         VARCHAR(17) PRIMARY KEY,
    vehicle_model_id            INT NOT NULL REFERENCES vehicle_models(id),
    current_global_status       vehicle_status_enum NOT NULL DEFAULT 'IN_PRODUCTION',
    current_phase               SMALLINT NOT NULL DEFAULT 1 CHECK (current_phase BETWEEN 1 AND 8),
    total_progress_percentage   NUMERIC(5,2) NOT NULL DEFAULT 0.00
                                 CHECK (total_progress_percentage BETWEEN 0 AND 100),
    eol_template_id             INT REFERENCES checklist_templates(id),
    shipment_template_id        INT REFERENCES checklist_templates(id),
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN vehicles.current_global_status IS
    'Auto-transitioned by triggers: IN_PRODUCTION -> IN_WAREHOUSE when phase 8 + EoL gate complete, '
    'IN_WAREHOUSE -> WITH_CUSTOMER when the shipment checklist is fully OK/CONDITIONAL_OK. '
    'Manual override is allowed for MANAGER_ADMIN via the web dashboard.';

-- =====================================================================
-- SECTION 4: issue_list (Issue & Repair Lifecycle Table)
-- Created before the two progress tables so they can hold a nullable FK
-- back to the issue that a failed checkpoint/checklist item generated.
-- =====================================================================

CREATE TABLE issue_list (
    id                     BIGSERIAL PRIMARY KEY,
    vin                    VARCHAR(17) NOT NULL REFERENCES vehicles(vin) ON DELETE CASCADE,

    source_type            issue_source_enum NOT NULL,
    source_checkpoint_id   INT REFERENCES checkpoints(id),
    source_check_item_id   INT REFERENCES checklist_template_items(id),
    station_id             INT REFERENCES stations(id),  -- denormalized for fast Defect Rate per Station queries

    issue_type_id          INT REFERENCES issue_types(id),
    severity               issue_severity_enum NOT NULL,
    description            TEXT NOT NULL,
    picture_url            TEXT,

    status                 issue_status_enum NOT NULL DEFAULT 'OPEN',

    issue_reporter_id      INT NOT NULL REFERENCES users(id),
    issue_date             TIMESTAMPTZ NOT NULL DEFAULT now(),

    process_reporter_id    INT REFERENCES users(id),
    process_date           TIMESTAMPTZ,

    finish_reporter_id     INT REFERENCES users(id),
    finish_date            TIMESTAMPTZ,

    approve_reporter_id    INT REFERENCES users(id),
    approve_date           TIMESTAMPTZ,

    issue_picture_done_url TEXT,
    solution_description   TEXT,

    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_issue_source CHECK (
        (source_type = 'PHASE_CHECKPOINT' AND source_checkpoint_id IS NOT NULL AND source_check_item_id IS NULL)
        OR
        (source_type IN ('EOL_ITEM', 'SHIPMENT_ITEM') AND source_check_item_id IS NOT NULL AND source_checkpoint_id IS NULL)
    )
);

-- =====================================================================
-- SECTION 5: production_phase_progress (8-Phase Progress & Operator Tracking)
-- =====================================================================

CREATE TABLE production_phase_progress (
    id                BIGSERIAL PRIMARY KEY,
    vin               VARCHAR(17) NOT NULL REFERENCES vehicles(vin) ON DELETE CASCADE,
    phase_number      SMALLINT NOT NULL REFERENCES phases(phase_number),
    checkpoint_id     INT NOT NULL REFERENCES checkpoints(id),

    status            checkpoint_status_enum NOT NULL DEFAULT 'PENDING',
    checked_by        INT REFERENCES users(id),  -- operator who ticked the item; drives "Confirmed by <operator>" UI label
    checked_at        TIMESTAMPTZ,

    related_issue_id  BIGINT REFERENCES issue_list(id),  -- set automatically when status = NOT_OK

    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (vin, checkpoint_id)
);

-- =====================================================================
-- SECTION 6: eol_and_shipment_checklist_progress
-- (13-item EoL and N-item Shipment checklist progress — template driven)
-- =====================================================================

CREATE TABLE eol_and_shipment_checklist_progress (
    id                BIGSERIAL PRIMARY KEY,
    vin               VARCHAR(17) NOT NULL REFERENCES vehicles(vin) ON DELETE CASCADE,
    checklist_type    checklist_type_enum NOT NULL,
    check_item_id     INT NOT NULL REFERENCES checklist_template_items(id),

    check_status      check_status_enum NOT NULL DEFAULT 'PENDING',
    checker_id        INT REFERENCES users(id),   -- operator who evaluated the item; shown live under the item in UI
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

    -- Mandatory-description rule (PRD FR-3.3): enforced at the database
    -- layer so it cannot be bypassed even by a direct API call.
    CONSTRAINT chk_description_required_by_status CHECK (
        check_status IN ('PENDING', 'OK')
        OR (check_status = 'NOT_OK' AND rejected_desc IS NOT NULL)
        OR (check_status = 'REWORK' AND rework_desc IS NOT NULL)
        OR (check_status = 'CONDITIONAL_OK' AND conditional_desc IS NOT NULL)
    )
);

-- =====================================================================
-- SECTION 7: audit_logs (Analysis & Process History Table)
-- Append-only. Feeds Elapsed Time, MTTR and all Analysis-tab charts.
-- =====================================================================

CREATE TABLE audit_logs (
    id             BIGSERIAL PRIMARY KEY,
    vin            VARCHAR(17) NOT NULL REFERENCES vehicles(vin) ON DELETE CASCADE,
    event_type     audit_event_enum NOT NULL,
    old_value      TEXT,
    new_value      TEXT,
    phase_number   SMALLINT REFERENCES phases(phase_number),
    station_id     INT REFERENCES stations(id),
    performed_by   INT REFERENCES users(id),
    event_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata       JSONB
);

-- =====================================================================
-- SECTION 8: INDEXING STRATEGY
-- =====================================================================

-- --- VIN partial search (last-5-digit lookup) --------------------------
-- vehicles.vin already has a unique btree index (PK) for exact match.
-- Partial "LIKE '%00057%'" search needs a trigram GIN index to stay in
-- the millisecond range at million-row scale.
CREATE INDEX idx_vehicles_vin_trgm ON vehicles USING gin (vin gin_trgm_ops);

-- Common vehicle-list filters
CREATE INDEX idx_vehicles_status ON vehicles (current_global_status);
CREATE INDEX idx_vehicles_model ON vehicles (vehicle_model_id);

-- --- issue_list: Analysis-tab hot paths --------------------------------
CREATE INDEX idx_issue_list_vin ON issue_list (vin);

-- "Daily Pending Issues" and "Vehicle Severity Breakdown" both filter on
-- open/in-progress issues; a partial index keeps this narrow and fast.
CREATE INDEX idx_issue_list_open_by_vin
    ON issue_list (vin, severity)
    WHERE status IN ('OPEN', 'IN_PROGRESS');

CREATE INDEX idx_issue_list_status_date ON issue_list (status, issue_date);
CREATE INDEX idx_issue_list_station ON issue_list (station_id);
CREATE INDEX idx_issue_list_severity ON issue_list (severity);

-- date_trunc(text, timestamptz) is STABLE, not IMMUTABLE (it depends on
-- the session TimeZone setting), so it cannot be used directly inside a
-- CREATE INDEX expression. This small wrapper pins the conversion to UTC
-- and is declared IMMUTABLE, which is the standard Postgres pattern for
-- day-level expression indexes on timestamptz columns.
CREATE OR REPLACE FUNCTION immutable_utc_date(ts TIMESTAMPTZ)
RETURNS DATE AS $$
    SELECT (ts AT TIME ZONE 'UTC')::date;
$$ LANGUAGE sql IMMUTABLE;

-- Expression index for fast day-level grouping in the Daily Pending /
-- Completed Issues charts (avoids a functional scan on every query).
CREATE INDEX idx_issue_list_issue_date_day ON issue_list (immutable_utc_date(issue_date));

-- --- production_phase_progress -----------------------------------------
CREATE INDEX idx_ppp_vin_phase ON production_phase_progress (vin, phase_number);
CREATE INDEX idx_ppp_checkpoint ON production_phase_progress (checkpoint_id);
CREATE INDEX idx_ppp_checked_at ON production_phase_progress (checked_at);

-- --- eol_and_shipment_checklist_progress --------------------------------
CREATE INDEX idx_eol_ship_vin_type ON eol_and_shipment_checklist_progress (vin, checklist_type);

-- Speeds up the hard-block gate check ("are all items OK/CONDITIONAL_OK?")
CREATE INDEX idx_eol_ship_status
    ON eol_and_shipment_checklist_progress (vin, checklist_type, check_status);

-- --- audit_logs: append-only, time-series ------------------------------
CREATE INDEX idx_audit_logs_vin_event_at ON audit_logs (vin, event_at);
CREATE INDEX idx_audit_logs_type_event_at ON audit_logs (event_type, event_at);

-- BRIN is far cheaper than btree for a large, naturally time-ordered,
-- append-only table and is the recommended index type once audit_logs
-- reaches multi-million-row scale (see architecture notes for
-- partitioning guidance beyond this).
CREATE INDEX idx_audit_logs_event_at_brin ON audit_logs USING brin (event_at);

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
       count(*) FILTER (WHERE status IN ('OPEN', 'IN_PROGRESS')) AS pending_count
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
WHERE status IN ('OPEN', 'IN_PROGRESS')
GROUP BY vin
ORDER BY total_open_issues DESC;

-- Biten / Devam Eden İşler (Pie chart source) — vehicle completion split
CREATE OR REPLACE VIEW vw_vehicle_completion_split AS
SELECT count(*) FILTER (WHERE total_progress_percentage >= 100) AS completed_vehicles,
       count(*) FILTER (WHERE total_progress_percentage < 100) AS in_progress_vehicles
FROM vehicles;

-- =====================================================================
-- SECTION 11: MINIMAL SEED DATA (reference rows only — no vehicle data)
-- =====================================================================

INSERT INTO phases (phase_number, name) VALUES
    (1, 'Phase 1'), (2, 'Phase 2'), (3, 'Phase 3'), (4, 'Phase 4'),
    (5, 'Phase 5'), (6, 'Phase 6'), (7, 'Phase 7'), (8, 'Phase 8');

-- Sample checklist templates (generic defaults, vehicle_model_id = NULL)
INSERT INTO checklist_templates (vehicle_model_id, type, name, is_active) VALUES
    (NULL, 'EOL', 'Default EoL Template (13 items)', TRUE),
    (NULL, 'SHIPMENT', 'Default Shipment Template (43 items)', TRUE);

-- Item rows are omitted here for brevity — see architecture notes
-- (09_KAREA_DB_Mimari_ve_Kurulum_Notlari.md) for the seed-data loading plan.
