-- Stable identity for checklist items that come from seed 03.
--
-- item_no is a display position: ReorderTemplateItems renumbers it 1..n, so
-- matching seed rows on (template_id, item_no) wrote seed text onto whatever
-- item happened to sit in that slot. seed_key is the md5 of the item text at
-- the moment the row was created and is never updated afterwards, so it keeps
-- pointing at the same row through text edits, deactivation and reordering.
-- Seed 03 inserts a seed item only when no row in its template carries that
-- key. Items added through the admin UI keep seed_key NULL.
--
-- Backfill runs only when the column is first added, so re-running this file
-- never stamps keys onto items created after the first run.
-- No application code reads the column: old and new API builds both work on
-- either side of this migration.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'checklist_template_items'
          AND column_name = 'seed_key'
    ) THEN
        ALTER TABLE checklist_template_items ADD COLUMN seed_key TEXT;

        UPDATE checklist_template_items i
        SET seed_key = md5(i.item_text)
        FROM checklist_templates t
        WHERE t.id = i.template_id
          AND t.vehicle_model_id IS NULL;
    END IF;
END $$;

COMMENT ON COLUMN checklist_template_items.seed_key IS
    'md5 of the seed item text when the row was created; never updated. '
    'Seed 03 uses it to detect missing default items. NULL for admin-created items.';
