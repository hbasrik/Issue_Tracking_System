-- =====================================================================
-- KAREA — Integrated Production Tracking & Monitoring Platform
-- PostgreSQL Database Schema (DDL) — v2.0
-- Reference: 11_KAREA_v2_Mimari_Mutabakati.md (Karar 1-8)
-- Supersedes 08_KAREA_database_schema.sql (v1.0).
-- All identifiers and comments are in English per Clean Code convention.
-- =====================================================================

-- =====================================================================
-- SECTION 0: EXTENSIONS
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;      -- trigram search for partial VIN / vehicle_number lookup
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";  -- reserved for future UUID-based entities

-- =====================================================================
-- SECTION 1: ENUM TYPES
-- =====================================================================

-- user_role_enum (v1) is REMOVED — RBAC is now table-driven (Karar 3),
-- see roles / permissions / role_permissions below.

CREATE TYPE vehicle_status_enum AS ENUM (
    'IN_PRODUCTION',  -- Hatta
    'IN_WAREHOUSE',   -- Depoda
    'WITH_CUSTOMER',  -- Musteride
    'SHIPPED',        -- Sevk edildi (final logistics state, after EOL document approval)
    'ON_HOLD'         -- manual exception state
);

CREATE TYPE station_step_status_enum AS ENUM (  -- renamed from checkpoint_status_enum (Karar 1)
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
    'SHIPMENT',   -- Customer Vehicle Checklist (43 items)
    'TEST'        -- Karar 4: new, independent 45-item checklist module
);

-- Karar 2: EOL items belong to one of two workflow phases. The Document
-- phase has no checklist items of its own (approval-only), so it is not
-- a value here — it is represented in eol_workflow_stage_enum instead.
CREATE TYPE eol_item_phase_enum AS ENUM (
    'BRANCH',
    'DEPOT'
);

-- Karar 2: drives vehicle_eol_workflow.current_stage
CREATE TYPE eol_workflow_stage_enum AS ENUM (
    'BRANCH',
    'DEPOT',
    'DOCUMENT',
    'COMPLETED'
);

CREATE TYPE issue_status_enum AS ENUM (
    'OPEN',                 -- Bekliyor: reported, not yet picked up
    'IN_PROGRESS',          -- Islemde: repair underway
    'DONE',                 -- Tamamlandi: repair finished, awaiting quality decision
    'APPROVED',             -- Kalite Onay: full sign-off, terminal/closed
    'CONDITIONAL_APPROVED'  -- Karar 6 (Şartlı Onay): alternate terminal/closed branch from DONE
);

CREATE TYPE issue_severity_enum AS ENUM (
    'CRITICAL',
    'MEDIUM',
    'LOW'
);

CREATE TYPE issue_source_enum AS ENUM (
    'STATION_STEP',  -- renamed from PHASE_CHECKPOINT (Karar 1)
    'EOL_ITEM',
    'SHIPMENT_ITEM',
    'TEST_ITEM'       -- Karar 4
);

CREATE TYPE audit_event_enum AS ENUM (
    'STATUS_CHANGE',
    'LOCATION_CHANGE',
    'STATION_ENTER',
    'STATION_EXIT',
    'CHECKLIST_ITEM_UPDATE',
    'ISSUE_STATUS_CHANGE',
    'EOL_WORKFLOW_STAGE_CHANGE',  -- new: branch shipped / depot released / document approved
    'MEDIA_UPLOADED'              -- new: Karar 8
    -- PHASE_ENTER / PHASE_EXIT (v1) removed — superseded by STATION_ENTER / STATION_EXIT
);

-- =====================================================================
-- SECTION 2: REFERENCE / MASTER TABLES
-- =====================================================================

-- --- RBAC (Karar 3): table-driven so the 8-role matrix from the v2 spec
-- can be added later without a schema change — only new rows. Phase 1
-- ships with exactly 2 seed roles (OPERATOR, MANAGER_ADMIN).
CREATE TABLE roles (
    id         SERIAL PRIMARY KEY,
    code       VARCHAR(50) NOT NULL UNIQUE,
    name       VARCHAR(100) NOT NULL,
    is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE permissions (
    id           SERIAL PRIMARY KEY,
    code         VARCHAR(100) NOT NULL UNIQUE,  -- e.g. 'issue.approve', 'eol.depot_release'
    description  VARCHAR(250)
);

CREATE TABLE role_permissions (
    role_id        INT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id  INT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE users (
    id             SERIAL PRIMARY KEY,
    full_name      VARCHAR(150) NOT NULL,
    email          VARCHAR(200) NOT NULL UNIQUE,
    password_hash  VARCHAR(255) NOT NULL,  -- bcrypt hash, never store or return plaintext
    role_id        INT NOT NULL REFERENCES roles(id),
    is_active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE vehicle_models (
    id            SERIAL PRIMARY KEY,
    name          VARCHAR(100) NOT NULL UNIQUE,
    code          VARCHAR(30) NOT NULL UNIQUE,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE
);

-- Karar 1: replaces `phases`. No fixed count — stations are ordered by
-- sequence_no, and any number can be defined.
CREATE TABLE stations (
    id            SERIAL PRIMARY KEY,
    name          VARCHAR(100) NOT NULL,
    sequence_no   SMALLINT NOT NULL UNIQUE,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE
);

-- Karar 1: replaces `checkpoints`. Master step catalogue (the items
-- within a station); vehicle-specific progress lives in
-- vehicle_station_step_progress so this stays a small, stable reference
-- set even as vehicle volume grows.
CREATE TABLE station_steps (
    id            SERIAL PRIMARY KEY,
    station_id    INT NOT NULL REFERENCES stations(id),
    sequence_no   SMALLINT NOT NULL,
    name          VARCHAR(150) NOT NULL,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (station_id, sequence_no)
);

-- Issue category catalogue (e.g. Electrical, Paint, Trim) used for
-- "hata turu" filtering in the Analysis tab.
CREATE TABLE issue_types (
    id            SERIAL PRIMARY KEY,
    name          VARCHAR(100) NOT NULL UNIQUE
);

-- Multi-template architecture (v1 Decision Log #3, reconfirmed for v2):
-- EOL / Shipment / Test checklists can differ per vehicle model instead
-- of being hard-coded.
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
    eol_phase     eol_item_phase_enum,  -- Karar 2: only populated for items on an EOL-type template
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (template_id, item_no)
);

COMMENT ON COLUMN checklist_template_items.eol_phase IS
    'BRANCH or DEPOT for EOL-type templates; must be NULL for SHIPMENT/TEST templates. '
    'Enforced at the application layer (not a DB CHECK, since it depends on the parent template''s type).';

-- =====================================================================
-- SECTION 3: CORE TABLE — vehicles (Master Vehicle Identity Table)
-- =====================================================================

CREATE TABLE vehicles (
    vin                         VARCHAR(17) PRIMARY KEY,
    vehicle_number              VARCHAR(30) UNIQUE,  -- Karar 5: short number, resolves to this VIN
    vehicle_model_id            INT NOT NULL REFERENCES vehicle_models(id),
    current_global_status       vehicle_status_enum NOT NULL DEFAULT 'IN_PRODUCTION',
    current_station_id          INT REFERENCES stations(id),  -- Karar 1: replaces current_phase; set by trigger on first station
    total_progress_percentage   NUMERIC(5,2) NOT NULL DEFAULT 0.00
                                 CHECK (total_progress_percentage BETWEEN 0 AND 100),
    eol_template_id             INT REFERENCES checklist_templates(id),
    shipment_template_id        INT REFERENCES checklist_templates(id),
    test_template_id            INT REFERENCES checklist_templates(id),  -- Karar 4
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN vehicles.current_global_status IS
    'Auto-transitioned by triggers. IN_PRODUCTION -> IN_WAREHOUSE when EOL branch phase ships '
    '(soft-warning on open issues). IN_WAREHOUSE -> WITH_CUSTOMER when the shipment/customer '
    'checklist is fully OK/CONDITIONAL_OK (independent track from the EOL branch/depot/document '
    'workflow). Final -> SHIPPED when the EOL document phase is approved. '
    'Manual override is allowed for MANAGER_ADMIN via the web dashboard, subject to the same gates.';

COMMENT ON COLUMN vehicles.vehicle_number IS
    'Karar 5: short factory number used for lookup instead of a separate Full_VIN_List master table. '
    'Operator enters this; the system resolves and displays the VIN read-only.';

-- =====================================================================
-- SECTION 4: issue_list (Issue & Repair Lifecycle Table)
-- Created before the progress tables so they can hold a nullable FK back
-- to the issue that a failed station step / checklist item generated.
-- =====================================================================

CREATE TABLE issue_list (
    id                     BIGSERIAL PRIMARY KEY,
    vin                    VARCHAR(17) NOT NULL REFERENCES vehicles(vin) ON DELETE CASCADE,

    source_type             issue_source_enum NOT NULL,
    source_station_step_id  INT REFERENCES station_steps(id),  -- renamed from source_checkpoint_id
    source_check_item_id    INT REFERENCES checklist_template_items(id),
    station_id              INT REFERENCES stations(id),  -- denormalized for fast Defect Rate per Station queries

    issue_type_id          INT REFERENCES issue_types(id),
    severity               issue_severity_enum NOT NULL,
    description             TEXT NOT NULL,
    picture_url             TEXT,  -- Karar 8: kept for now, gradually migrated to media_attachments

    status                 issue_status_enum NOT NULL DEFAULT 'OPEN',

    issue_reporter_id      INT NOT NULL REFERENCES users(id),
    issue_date              TIMESTAMPTZ NOT NULL DEFAULT now(),

    process_reporter_id    INT REFERENCES users(id),
    process_date             TIMESTAMPTZ,

    finish_reporter_id     INT REFERENCES users(id),
    finish_date              TIMESTAMPTZ,

    approve_reporter_id    INT REFERENCES users(id),
    approve_date              TIMESTAMPTZ,

    conditional_approve_reporter_id  INT REFERENCES users(id),  -- Karar 6
    conditional_approve_date          TIMESTAMPTZ,               -- Karar 6

    issue_picture_done_url TEXT,
    solution_description    TEXT,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_issue_source CHECK (
        (source_type = 'STATION_STEP' AND source_station_step_id IS NOT NULL AND source_check_item_id IS NULL)
        OR
        (source_type IN ('EOL_ITEM', 'SHIPMENT_ITEM', 'TEST_ITEM') AND source_check_item_id IS NOT NULL AND source_station_step_id IS NULL)
    ),

    -- Karar 6: DONE can branch to either APPROVED or CONDITIONAL_APPROVED,
    -- but never both — enforced structurally by requiring exactly one of
    -- the two reporter/date pairs to be set once the issue reaches either
    -- terminal state (validated at the application layer for the status
    -- transition itself; this CHECK only guards data consistency).
    CONSTRAINT chk_conditional_approve_pair CHECK (
        (conditional_approve_reporter_id IS NULL) = (conditional_approve_date IS NULL)
    )
);

-- =====================================================================
-- SECTION 5: vehicle_station_step_progress
-- Karar 1: replaces production_phase_progress. Tracks per-vehicle
-- completion of each station's steps; soft-warning only, never blocks.
-- =====================================================================

CREATE TABLE vehicle_station_step_progress (
    id                BIGSERIAL PRIMARY KEY,
    vin               VARCHAR(17) NOT NULL REFERENCES vehicles(vin) ON DELETE CASCADE,
    station_id        INT NOT NULL REFERENCES stations(id),
    station_step_id   INT NOT NULL REFERENCES station_steps(id),

    status            station_step_status_enum NOT NULL DEFAULT 'PENDING',
    checked_by        INT REFERENCES users(id),  -- operator who ticked the item; drives "Confirmed by <operator>" UI label
    checked_at        TIMESTAMPTZ,

    related_issue_id  BIGINT REFERENCES issue_list(id),  -- set automatically when status = NOT_OK

    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (vin, station_step_id)
);

-- =====================================================================
-- SECTION 6: checklist_item_progress
-- Renamed from eol_and_shipment_checklist_progress (Karar 4 adds TEST
-- as a third checklist_type value flowing through the same table —
-- the multi-template architecture already supported this without a new
-- table family).
-- =====================================================================

CREATE TABLE checklist_item_progress (
    id                BIGSERIAL PRIMARY KEY,
    vin               VARCHAR(17) NOT NULL REFERENCES vehicles(vin) ON DELETE CASCADE,
    checklist_type    checklist_type_enum NOT NULL,
    check_item_id     INT NOT NULL REFERENCES checklist_template_items(id),

    check_status      check_status_enum NOT NULL DEFAULT 'PENDING',
    checker_id        INT REFERENCES users(id),   -- operator who evaluated the item; shown live under the item in UI
    check_date        TIMESTAMPTZ,
    check_image_url   TEXT,  -- Karar 8: kept for now, gradually migrated to media_attachments

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

    -- Mandatory-description rule (v1 PRD FR-3.3, carried into v2):
    -- enforced at the database layer so it cannot be bypassed even by a
    -- direct API call.
    CONSTRAINT chk_description_required_by_status CHECK (
        check_status IN ('PENDING', 'OK')
        OR (check_status = 'NOT_OK' AND rejected_desc IS NOT NULL)
        OR (check_status = 'REWORK' AND rework_desc IS NOT NULL)
        OR (check_status = 'CONDITIONAL_OK' AND conditional_desc IS NOT NULL)
    )
);

-- =====================================================================
-- SECTION 6b: vehicle_eol_workflow (NEW — Karar 2)
-- One row per vehicle. Tracks the 3-stage Branch -> Depot -> Document
-- EOL workflow independently of the (parallel) Shipment/Customer
-- checklist track.
-- =====================================================================

CREATE TABLE vehicle_eol_workflow (
    vin                       VARCHAR(17) PRIMARY KEY REFERENCES vehicles(vin) ON DELETE CASCADE,
    current_stage             eol_workflow_stage_enum NOT NULL DEFAULT 'BRANCH',

    branch_shipped_at         TIMESTAMPTZ,  -- "Depoya Sevk Edildi" — soft-warning only, never blocked
    branch_shipped_by         INT REFERENCES users(id),
    branch_open_issue_count_at_shipment  INT,  -- snapshot for audit/reporting of the warning shown

    depot_released_at         TIMESTAMPTZ,  -- hard-block gate: open issues must be zero
    depot_released_by         INT REFERENCES users(id),

    document_approved_at      TIMESTAMPTZ,
    document_approved_by      INT REFERENCES users(id),

    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE vehicle_eol_workflow IS
    'Karar 2: Branch shipment is a soft-warning transition (open issues warn, do not block). '
    'Depot release is a hard-block transition (open issues — OPEN/IN_PROGRESS/DONE — are rejected '
    'at the database layer, not just the UI). Document approval is the final EOL sign-off.';

-- =====================================================================
-- SECTION 7: audit_logs (Analysis & Process History Table)
-- Append-only. Feeds Elapsed Time, MTTR, all Analysis-tab charts, and
-- — per Karar 7 — doubles as the Issue_History audit trail (no separate
-- table needed; ISSUE_STATUS_CHANGE events + metadata JSONB cover it).
-- =====================================================================

CREATE TABLE audit_logs (
    id             BIGSERIAL PRIMARY KEY,
    vin            VARCHAR(17) NOT NULL REFERENCES vehicles(vin) ON DELETE CASCADE,
    event_type     audit_event_enum NOT NULL,
    old_value      TEXT,
    new_value      TEXT,
    station_id     INT REFERENCES stations(id),  -- phase_number (v1) removed, station_id is now the single location reference
    performed_by   INT REFERENCES users(id),
    event_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata       JSONB
);

-- =====================================================================
-- SECTION 7b: media_attachments (NEW — Karar 8)
-- Polymorphic attachment table. entity_id is TEXT to support both the
-- VARCHAR vin (VEHICLE) and numeric ids (ISSUE, CHECKLIST_ITEM_PROGRESS)
-- without three separate FK columns. Referential integrity for the
-- polymorphic link is enforced at the application layer.
-- =====================================================================

CREATE TABLE media_attachments (
    id             BIGSERIAL PRIMARY KEY,
    entity_type    VARCHAR(50) NOT NULL,   -- 'VEHICLE' | 'ISSUE' | 'CHECKLIST_ITEM_PROGRESS' | 'STATION_STEP_PROGRESS'
    entity_id      TEXT NOT NULL,
    file_name      VARCHAR(255) NOT NULL,
    storage_path   TEXT NOT NULL,
    mime_type      VARCHAR(100),
    file_size      BIGINT,
    uploaded_by    INT REFERENCES users(id),
    uploaded_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
-- SECTION 8: INDEXING STRATEGY
-- =====================================================================

-- --- VIN / vehicle_number lookup ---------------------------------------
-- vehicles.vin already has a unique btree index (PK) for exact match.
-- Partial "LIKE '%00057%'" search needs a trigram GIN index to stay in
-- the millisecond range at million-row scale.
CREATE INDEX idx_vehicles_vin_trgm ON vehicles USING gin (vin gin_trgm_ops);
CREATE INDEX idx_vehicles_vehicle_number ON vehicles (vehicle_number);  -- Karar 5

-- Common vehicle-list filters
CREATE INDEX idx_vehicles_status ON vehicles (current_global_status);
CREATE INDEX idx_vehicles_model ON vehicles (vehicle_model_id);
CREATE INDEX idx_vehicles_current_station ON vehicles (current_station_id);

-- --- issue_list: Analysis-tab hot paths --------------------------------
CREATE INDEX idx_issue_list_vin ON issue_list (vin);

-- "Daily Pending Issues" and "Vehicle Severity Breakdown" both filter on
-- not-yet-closed issues (OPEN/IN_PROGRESS/DONE — DONE means the repair
-- is finished but still awaiting quality approval, so it is not closed
-- yet); a partial index keeps this narrow and fast.
CREATE INDEX idx_issue_list_open_by_vin
    ON issue_list (vin, severity)
    WHERE status IN ('OPEN', 'IN_PROGRESS', 'DONE');

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

-- --- vehicle_station_step_progress --------------------------------------
CREATE INDEX idx_vssp_vin_station ON vehicle_station_step_progress (vin, station_id);
CREATE INDEX idx_vssp_station_step ON vehicle_station_step_progress (station_step_id);
CREATE INDEX idx_vssp_checked_at ON vehicle_station_step_progress (checked_at);

-- --- checklist_item_progress ---------------------------------------------
CREATE INDEX idx_cip_vin_type ON checklist_item_progress (vin, checklist_type);

-- Speeds up the depot hard-block gate check ("any open issues left?") and
-- the EOL/Shipment/Test "all OK/CONDITIONAL_OK?" completion checks.
CREATE INDEX idx_cip_status
    ON checklist_item_progress (vin, checklist_type, check_status);

-- --- vehicle_eol_workflow -------------------------------------------------
CREATE INDEX idx_eol_workflow_stage ON vehicle_eol_workflow (current_stage);

-- --- media_attachments ------------------------------------------------------
CREATE INDEX idx_media_attachments_entity ON media_attachments (entity_type, entity_id);

-- --- role_permissions lookups ---------------------------------------------
CREATE INDEX idx_role_permissions_permission ON role_permissions (permission_id);

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

CREATE TRIGGER trg_vssp_updated_at
    BEFORE UPDATE ON vehicle_station_step_progress
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_cip_updated_at
    BEFORE UPDATE ON checklist_item_progress
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_eol_workflow_updated_at
    BEFORE UPDATE ON vehicle_eol_workflow
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- --- Auto-assign checklist templates on vehicle creation ----------------
-- Multi-template rule (v1 Decision Log #3): pick the model-specific
-- template if one is active, otherwise fall back to the generic default
-- (vehicle_model_id IS NULL) template of the same type. Karar 4 extends
-- this to also assign a TEST template.
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

CREATE TRIGGER trg_assign_checklist_templates
    BEFORE INSERT ON vehicles
    FOR EACH ROW EXECUTE FUNCTION fn_assign_checklist_templates();

-- --- Materialize station-step / checklist / EOL-workflow rows for a ----
-- new vehicle. Copies the active station_steps catalogue and the three
-- assigned templates into vehicle-scoped progress rows so the mobile app
-- always has a concrete row to tick against (status = PENDING), and
-- opens the EOL workflow at stage BRANCH.
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

CREATE TRIGGER trg_initialize_vehicle_progress
    AFTER INSERT ON vehicles
    FOR EACH ROW EXECUTE FUNCTION fn_initialize_vehicle_progress();

-- --- Recalculate completion %, current_station -------------------------
-- Soft-warning rule (v1 Decision Log #2, unchanged): a NOT_OK step never
-- blocks progress into the next station, it is simply excluded from the
-- percentage until its linked issue is resolved and the item re-ticked.
-- Unlike v1, completing all station steps no longer auto-flips
-- current_global_status — that now happens via the EOL branch-shipment
-- transition below (Karar 2), which is a separate, explicit action.
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

    -- lowest-sequence station that still has a non-OK step; last active
    -- station if everything is complete.
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

CREATE TRIGGER trg_recalculate_vehicle_progress
    AFTER INSERT OR UPDATE OF status ON vehicle_station_step_progress
    FOR EACH ROW EXECUTE FUNCTION fn_recalculate_vehicle_progress();

-- --- Karar 2, stage 1: Branch shipment (soft-warning, never blocks) ----
-- Fires when branch_shipped_at transitions from NULL to a value. Snapshots
-- the open-issue count for audit purposes, logs a warning event if any
-- exist, but always proceeds — moves the vehicle to IN_WAREHOUSE and the
-- workflow to stage DEPOT.
CREATE OR REPLACE FUNCTION fn_enforce_branch_shipment()
RETURNS TRIGGER AS $$
DECLARE
    v_open_issue_count INT;
BEGIN
    IF NEW.branch_shipped_at IS NOT NULL AND OLD.branch_shipped_at IS NULL THEN
        SELECT count(*) INTO v_open_issue_count
        FROM issue_list
        WHERE vin = NEW.vin AND status IN ('OPEN', 'IN_PROGRESS', 'DONE');

        NEW.branch_open_issue_count_at_shipment := v_open_issue_count;
        NEW.current_stage := 'DEPOT';

        UPDATE vehicles SET current_global_status = 'IN_WAREHOUSE' WHERE vin = NEW.vin;

        INSERT INTO audit_logs (vin, event_type, old_value, new_value, performed_by, metadata)
        VALUES (NEW.vin, 'EOL_WORKFLOW_STAGE_CHANGE', 'BRANCH', 'DEPOT', NEW.branch_shipped_by,
                jsonb_build_object('open_issue_count_warning', v_open_issue_count, 'blocked', FALSE));
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_branch_shipment
    BEFORE UPDATE OF branch_shipped_at ON vehicle_eol_workflow
    FOR EACH ROW EXECUTE FUNCTION fn_enforce_branch_shipment();

-- --- Karar 2, stage 2: Depot release (hard-block gate) ------------------
-- Fires when depot_released_at transitions from NULL to a value. Rejects
-- the change outright — at the database layer, not just the UI — if any
-- open issues (OPEN/IN_PROGRESS/DONE) remain for the vehicle.
CREATE OR REPLACE FUNCTION fn_enforce_depot_release()
RETURNS TRIGGER AS $$
DECLARE
    v_open_issue_count INT;
BEGIN
    IF NEW.depot_released_at IS NOT NULL AND OLD.depot_released_at IS NULL THEN
        SELECT count(*) INTO v_open_issue_count
        FROM issue_list
        WHERE vin = NEW.vin AND status IN ('OPEN', 'IN_PROGRESS', 'DONE');

        IF v_open_issue_count > 0 THEN
            RAISE EXCEPTION 'Cannot release vehicle % from depot — % open issue(s) remain', NEW.vin, v_open_issue_count;
        END IF;

        NEW.current_stage := 'DOCUMENT';

        INSERT INTO audit_logs (vin, event_type, old_value, new_value, performed_by, metadata)
        VALUES (NEW.vin, 'EOL_WORKFLOW_STAGE_CHANGE', 'DEPOT', 'DOCUMENT', NEW.depot_released_by,
                jsonb_build_object('open_issue_count', 0, 'blocked', FALSE));
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_depot_release
    BEFORE UPDATE OF depot_released_at ON vehicle_eol_workflow
    FOR EACH ROW EXECUTE FUNCTION fn_enforce_depot_release();

-- --- Karar 2, stage 3: Document approval (final EOL sign-off) -----------
-- AFTER UPDATE so fn_enforce_manual_status_change can see the new
-- document_approved_at when it gates the SHIPPED transition. A BEFORE
-- trigger would UPDATE vehicles while the workflow row still had a NULL
-- timestamp, and every document-approve would raise.
CREATE OR REPLACE FUNCTION fn_enforce_document_approval()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.document_approved_at IS NOT NULL AND OLD.document_approved_at IS NULL THEN
        UPDATE vehicle_eol_workflow
        SET current_stage = 'COMPLETED'
        WHERE vin = NEW.vin
          AND current_stage IS DISTINCT FROM 'COMPLETED';

        UPDATE vehicles SET current_global_status = 'SHIPPED' WHERE vin = NEW.vin;

        INSERT INTO audit_logs (vin, event_type, old_value, new_value, performed_by, metadata)
        VALUES (NEW.vin, 'EOL_WORKFLOW_STAGE_CHANGE', 'DOCUMENT', 'COMPLETED', NEW.document_approved_by, '{}'::jsonb);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_document_approval
    AFTER UPDATE OF document_approved_at ON vehicle_eol_workflow
    FOR EACH ROW EXECUTE FUNCTION fn_enforce_document_approval();

-- --- Auto status transition: IN_WAREHOUSE -> WITH_CUSTOMER --------------
-- Hard-block rule (v1 Decision Log #4/#5, PRD FR-4.3, unchanged): ALL
-- shipment/customer checklist items for the vehicle must be OK or
-- CONDITIONAL_OK. This track runs independently of the EOL branch/depot/
-- document workflow above.
CREATE OR REPLACE FUNCTION fn_check_shipment_completion()
RETURNS TRIGGER AS $$
DECLARE
    v_all_passed BOOLEAN;
BEGIN
    IF NEW.checklist_type <> 'SHIPMENT' THEN
        RETURN NEW;
    END IF;

    SELECT NOT EXISTS (
        SELECT 1 FROM checklist_item_progress
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
    AFTER INSERT OR UPDATE OF check_status ON checklist_item_progress
    FOR EACH ROW EXECUTE FUNCTION fn_check_shipment_completion();

-- --- Defense-in-depth: reject manual/API status changes that bypass ----
-- the hard-block rules above, even if attempted directly (PRD FR-3.6 /
-- FR-4.3 "even a direct API call must be rejected"). Extended for Karar 2:
-- SHIPPED additionally requires the EOL document phase to be approved.
CREATE OR REPLACE FUNCTION fn_enforce_manual_status_change()
RETURNS TRIGGER AS $$
DECLARE
    v_shipment_incomplete BOOLEAN;
    v_document_not_approved BOOLEAN;
BEGIN
    IF NEW.current_global_status = OLD.current_global_status THEN
        RETURN NEW;
    END IF;

    IF NEW.current_global_status = 'WITH_CUSTOMER' THEN
        SELECT EXISTS (
            SELECT 1 FROM checklist_item_progress
            WHERE vin = NEW.vin AND checklist_type = 'SHIPMENT'
              AND check_status NOT IN ('OK', 'CONDITIONAL_OK')
        ) INTO v_shipment_incomplete;

        IF v_shipment_incomplete THEN
            RAISE EXCEPTION 'Cannot move vehicle % to WITH_CUSTOMER — shipment checklist is not fully OK/CONDITIONAL_OK', NEW.vin;
        END IF;
    END IF;

    IF NEW.current_global_status = 'SHIPPED' THEN
        SELECT NOT EXISTS (
            SELECT 1 FROM vehicle_eol_workflow
            WHERE vin = NEW.vin AND document_approved_at IS NOT NULL
        ) INTO v_document_not_approved;

        IF v_document_not_approved THEN
            RAISE EXCEPTION 'Cannot move vehicle % to SHIPPED — EOL document phase is not approved', NEW.vin;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_manual_status_change
    BEFORE UPDATE OF current_global_status ON vehicles
    FOR EACH ROW EXECUTE FUNCTION fn_enforce_manual_status_change();

-- --- Auto-link a failed station-step/checklist item to its issue --------
-- When an operator submits the "Hata Bildir" form, the application layer
-- inserts into issue_list first, then updates the source row's
-- related_issue_id. This trigger is a safety net that fills it in
-- automatically if the application forgets to.
CREATE OR REPLACE FUNCTION fn_link_latest_issue_to_source()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.source_type = 'STATION_STEP' THEN
        UPDATE vehicle_station_step_progress
        SET related_issue_id = NEW.id
        WHERE vin = NEW.vin AND station_step_id = NEW.source_station_step_id
          AND related_issue_id IS NULL;
    ELSE
        UPDATE checklist_item_progress
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
-- "Pending" = not yet APPROVED/CONDITIONAL_APPROVED. DONE means the
-- technician finished the repair but quality has not signed off yet, so
-- it still counts as open work from a KPI standpoint.
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

-- Araç Bazlı Açık Hata Dağılımı (VIN x Severity) — v1 Decision Log #7
-- Same "not yet closed" definition of open as vw_daily_pending_issues.
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

-- Kalite Onayı Bekleyenler — repairs finished but awaiting a quality
-- decision (either full APPROVED or Karar 6's CONDITIONAL_APPROVED).
CREATE OR REPLACE VIEW vw_issues_pending_quality_approval AS
SELECT id, vin, severity, finish_date, finish_reporter_id
FROM issue_list
WHERE status = 'DONE'
ORDER BY finish_date ASC;

-- Biten / Devam Eden İşler (Pie chart source) — vehicle completion split
CREATE OR REPLACE VIEW vw_vehicle_completion_split AS
SELECT count(*) FILTER (WHERE total_progress_percentage >= 100) AS completed_vehicles,
       count(*) FILTER (WHERE total_progress_percentage < 100) AS in_progress_vehicles
FROM vehicles;

-- EOL workflow funnel — new for Karar 2, shows how many vehicles sit in
-- each EOL stage at any given time.
CREATE OR REPLACE VIEW vw_eol_workflow_funnel AS
SELECT current_stage, count(*) AS vehicle_count
FROM vehicle_eol_workflow
GROUP BY current_stage;

-- =====================================================================
-- SECTION 11: MINIMAL SEED DATA (reference rows only — no vehicle data)
-- =====================================================================

-- --- RBAC seed (Karar 3): 2 roles now, table shape supports more later ---
INSERT INTO roles (code, name) VALUES
    ('OPERATOR', 'Operator'),
    ('MANAGER_ADMIN', 'Manager / Admin');

-- Representative permission set — extend freely without a schema change.
INSERT INTO permissions (code, description) VALUES
    ('vehicle.view', 'View vehicle records and progress'),
    ('station_step.update', 'Tick station step status'),
    ('checklist_item.update', 'Update EOL/Shipment/Test checklist item status'),
    ('issue.create', 'Report a new issue'),
    ('issue.transition.in_progress', 'Move an issue OPEN -> IN_PROGRESS'),
    ('issue.transition.done', 'Move an issue IN_PROGRESS -> DONE'),
    ('issue.transition.approve', 'Move an issue DONE -> APPROVED'),
    ('issue.transition.conditional_approve', 'Move an issue DONE -> CONDITIONAL_APPROVED'),
    ('eol.branch_ship', 'Mark EOL branch as shipped to depot'),
    ('eol.depot_release', 'Release a vehicle from depot (hard-block gate)'),
    ('eol.document_approve', 'Approve the EOL document phase'),
    ('analysis.view', 'View the Analysis tab'),
    ('admin.manage_masters', 'Manage master data (stations, templates, roles)');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'OPERATOR'
  AND p.code IN ('vehicle.view', 'station_step.update', 'checklist_item.update',
                 'issue.create', 'issue.transition.in_progress', 'issue.transition.done');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'MANAGER_ADMIN';  -- full access, all permissions

-- --- Stations (replaces v1's fixed 8 phases; still 8 by default, but ---
-- the table itself imposes no limit)
INSERT INTO stations (name, sequence_no) VALUES
    ('Station 1', 1), ('Station 2', 2), ('Station 3', 3), ('Station 4', 4),
    ('Station 5', 5), ('Station 6', 6), ('Station 7', 7), ('Station 8', 8);

-- Sample checklist templates (generic defaults, vehicle_model_id = NULL)
INSERT INTO checklist_templates (vehicle_model_id, type, name, is_active) VALUES
    (NULL, 'EOL', 'Default EoL Template (16 items, Branch + Depot)', TRUE),
    (NULL, 'SHIPMENT', 'Default Customer Vehicle Checklist (43 items)', TRUE),
    (NULL, 'TEST', 'Default Test Checklist (45 items)', TRUE);

-- Item rows are omitted here for brevity — see 09_KAREA_DB_Mimari_ve_Kurulum_Notlari.md
-- for the seed-data loading plan (to be updated alongside the v2 prompt sequence).
