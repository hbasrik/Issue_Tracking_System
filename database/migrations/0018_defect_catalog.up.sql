-- Defect classification catalogue (zones / parts / types / processes).
-- All issue_list columns are nullable so existing rows and flows stay intact.
-- Idempotent: safe to re-run after a partial/dirty apply.

CREATE TABLE IF NOT EXISTS defect_processes (
    id          SERIAL PRIMARY KEY,
    code        VARCHAR(32) NOT NULL UNIQUE,
    name_tr     VARCHAR(120) NOT NULL,
    name_en     VARCHAR(120) NOT NULL,
    sort_order  SMALLINT NOT NULL DEFAULT 0,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS defect_zones (
    id          SERIAL PRIMARY KEY,
    code        VARCHAR(16) NOT NULL UNIQUE,
    name_tr     VARCHAR(120) NOT NULL,
    name_en     VARCHAR(120) NOT NULL,
    sort_order  SMALLINT NOT NULL DEFAULT 0,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS defect_parts (
    id          SERIAL PRIMARY KEY,
    zone_id     INT NOT NULL REFERENCES defect_zones(id),
    code        VARCHAR(16) NOT NULL UNIQUE,
    name_tr     VARCHAR(120) NOT NULL,
    name_en     VARCHAR(120) NOT NULL,
    sort_order  SMALLINT NOT NULL DEFAULT 0,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_defect_parts_zone ON defect_parts (zone_id);

CREATE TABLE IF NOT EXISTS defect_types (
    id                   SERIAL PRIMARY KEY,
    code                 VARCHAR(16) NOT NULL UNIQUE,
    name_tr              VARCHAR(120) NOT NULL,
    name_en              VARCHAR(120) NOT NULL,
    default_process_id   INT REFERENCES defect_processes(id),
    sort_order           SMALLINT NOT NULL DEFAULT 0,
    is_active            BOOLEAN NOT NULL DEFAULT TRUE,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE issue_list
    ADD COLUMN IF NOT EXISTS defect_part_id INT REFERENCES defect_parts(id),
    ADD COLUMN IF NOT EXISTS defect_type_id INT REFERENCES defect_types(id),
    ADD COLUMN IF NOT EXISTS responsible_process_id INT REFERENCES defect_processes(id),
    ADD COLUMN IF NOT EXISTS custom_part_name VARCHAR(120),
    ADD COLUMN IF NOT EXISTS custom_defect_name VARCHAR(120),
    ADD COLUMN IF NOT EXISTS defect_code VARCHAR(32);

CREATE INDEX IF NOT EXISTS idx_issue_list_defect_part ON issue_list (defect_part_id)
    WHERE defect_part_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_issue_list_defect_type ON issue_list (defect_type_id)
    WHERE defect_type_id IS NOT NULL;
