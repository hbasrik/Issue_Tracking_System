-- Restore pre-MANUAL chk_issue_source (without MANUAL arm).
-- Does not restore deleted legacy issue_types rows.

ALTER TABLE issue_list DROP CONSTRAINT IF EXISTS chk_issue_source;
ALTER TABLE issue_list ADD CONSTRAINT chk_issue_source CHECK (
    (source_type = 'STATION_STEP'
        AND source_station_step_id IS NOT NULL
        AND source_check_item_id IS NULL)
    OR
    (source_type IN ('EOL_ITEM', 'SHIPMENT_ITEM', 'TEST_ITEM')
        AND source_check_item_id IS NOT NULL
        AND source_station_step_id IS NULL)
);
