-- Checklist item sections: display grouping independent of item_no.
-- section_key: stable id (e.g. brakes) mapped to checklist.section.* i18n,
--   or a custom free-text key shown as-is when no i18n match.
-- section_sort: section order in the UI (lower first); NULL sorts last.
-- Idempotent: ADD COLUMN IF NOT EXISTS; backfill only where still NULL.
--
-- Rationale (column vs section table): section_key is an i18n catalog id
-- (or free-text label), not a relational entity with its own lifecycle.
-- Reorder of items must not move sections; a separate table would add
-- join/admin cost without giving multi-tenant section definitions today.

ALTER TABLE checklist_template_items
    ADD COLUMN IF NOT EXISTS section_key VARCHAR(64),
    ADD COLUMN IF NOT EXISTS section_sort SMALLINT;

COMMENT ON COLUMN checklist_template_items.section_key IS
    'Display group id independent of item_no. NULL = unsectioned (Other items).';
COMMENT ON COLUMN checklist_template_items.section_sort IS
    'Order of the section among siblings; not tied to item_no reorder.';

-- Backfill from the historical mobile ItemNo ranges so first paint matches
-- the previous hardcoded SECTIONS maps (Test 1-45, Shipment 1-43).
-- Only fills rows that still have NULL section_key.

WITH test_map(lo, hi, section_key, section_sort) AS (
    VALUES
        (1,  4,  'brakes',       10),
        (5,  7,  'steering',     20),
        (8,  10, 'lights',       30),
        (11, 12, 'diag',         40),
        (13, 16, 'hv',           50),
        (17, 21, 'drive',        60),
        (22, 25, 'dash',         70),
        (26, 29, 'body',         80),
        (30, 36, 'adas',         90),
        (37, 39, 'infotainment', 100),
        (40, 45, 'final',        110)
)
UPDATE checklist_template_items cti
SET section_key = m.section_key,
    section_sort = m.section_sort
FROM checklist_templates ct, test_map m
WHERE ct.id = cti.template_id
  AND ct.type = 'TEST'
  AND cti.item_no BETWEEN m.lo AND m.hi
  AND cti.section_key IS NULL;

WITH ship_map(lo, hi, section_key, section_sort) AS (
    VALUES
        (1,  6,  'identity',  10),
        (7,  16, 'exterior',  20),
        (17, 20, 'locks',     30),
        (21, 27, 'lighting',  40),
        (28, 35, 'interior',  50),
        (36, 43, 'charge',    60)
)
UPDATE checklist_template_items cti
SET section_key = m.section_key,
    section_sort = m.section_sort
FROM checklist_templates ct, ship_map m
WHERE ct.id = cti.template_id
  AND ct.type = 'SHIPMENT'
  AND cti.item_no BETWEEN m.lo AND m.hi
  AND cti.section_key IS NULL;
