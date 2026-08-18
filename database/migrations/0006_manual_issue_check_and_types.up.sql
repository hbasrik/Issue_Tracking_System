-- MANUAL standalone issue reports: source FKs must both be NULL.
-- Requires 0005 (MANUAL enum label) to have already been applied.

ALTER TABLE issue_list DROP CONSTRAINT IF EXISTS chk_issue_source;
ALTER TABLE issue_list ADD CONSTRAINT chk_issue_source CHECK (
    (source_type = 'STATION_STEP'
        AND source_station_step_id IS NOT NULL
        AND source_check_item_id IS NULL)
    OR
    (source_type IN ('EOL_ITEM', 'SHIPMENT_ITEM', 'TEST_ITEM')
        AND source_check_item_id IS NOT NULL
        AND source_station_step_id IS NULL)
    OR
    (source_type = 'MANUAL'
        AND source_station_step_id IS NULL
        AND source_check_item_id IS NULL)
);

INSERT INTO issue_types (name) VALUES
    ('Hata'),
    ('Tamir Gerekiyor')
ON CONFLICT (name) DO NOTHING;

UPDATE issue_list
SET issue_type_id = (SELECT id FROM issue_types WHERE name = 'Hata')
WHERE issue_type_id IS NOT NULL
  AND issue_type_id NOT IN (
      SELECT id FROM issue_types WHERE name IN ('Hata', 'Tamir Gerekiyor')
  );

DELETE FROM issue_types
WHERE name NOT IN ('Hata', 'Tamir Gerekiyor');
