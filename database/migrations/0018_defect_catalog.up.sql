-- Defect classification catalogue (zones / parts / types / processes).
-- All issue_list columns are nullable so existing rows and flows stay intact.

CREATE TABLE defect_processes (
    id          SERIAL PRIMARY KEY,
    code        VARCHAR(32) NOT NULL UNIQUE,
    name_tr     VARCHAR(120) NOT NULL,
    name_en     VARCHAR(120) NOT NULL,
    sort_order  SMALLINT NOT NULL DEFAULT 0,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE defect_zones (
    id          SERIAL PRIMARY KEY,
    code        VARCHAR(16) NOT NULL UNIQUE,
    name_tr     VARCHAR(120) NOT NULL,
    name_en     VARCHAR(120) NOT NULL,
    sort_order  SMALLINT NOT NULL DEFAULT 0,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE defect_parts (
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

CREATE INDEX idx_defect_parts_zone ON defect_parts (zone_id);

CREATE TABLE defect_types (
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
    ADD COLUMN defect_part_id INT REFERENCES defect_parts(id),
    ADD COLUMN defect_type_id INT REFERENCES defect_types(id),
    ADD COLUMN responsible_process_id INT REFERENCES defect_processes(id),
    ADD COLUMN custom_part_name VARCHAR(120),
    ADD COLUMN custom_defect_name VARCHAR(120),
    ADD COLUMN defect_code VARCHAR(32);

CREATE INDEX idx_issue_list_defect_part ON issue_list (defect_part_id)
    WHERE defect_part_id IS NOT NULL;
CREATE INDEX idx_issue_list_defect_type ON issue_list (defect_type_id)
    WHERE defect_type_id IS NOT NULL;
