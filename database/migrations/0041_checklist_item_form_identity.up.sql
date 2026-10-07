-- 0041: form identity moves from the template to the item.
--
-- One template can carry items from more than one printed form (the EOL
-- template holds KY.FR-09 branch items and KY.FR-19 depot items), so the
-- form number, revision and publication date belong to each item:
--   checklist_template_items.form_code          "Form no", e.g. KY.FR-09
--   checklist_template_items.form_item_ref      item id on paper, e.g. E001 / 46
--   checklist_template_items.form_revision      revision of that form
--   checklist_template_items.form_published_at  publication date of that form
-- The template-level columns from 0039 are dropped. The guard below refuses to
-- drop them if any row holds a value, so no data can be lost here.
--
-- seed_key becomes unique per template (partial: admin-created items keep NULL).
-- Template names lose their item counts, which went stale as soon as items
-- were added or retired.

ALTER TABLE checklist_template_items
    ADD COLUMN IF NOT EXISTS form_code         TEXT NULL,
    ADD COLUMN IF NOT EXISTS form_item_ref     TEXT NULL,
    ADD COLUMN IF NOT EXISTS form_revision     TEXT NULL,
    ADD COLUMN IF NOT EXISTS form_published_at DATE NULL;

DO $$
DECLARE
    v_filled BIGINT := 0;
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = current_schema()
                 AND table_name = 'checklist_templates'
                 AND column_name = 'form_code') THEN
        EXECUTE 'SELECT count(*) FROM checklist_templates
                 WHERE form_code IS NOT NULL
                    OR form_revision IS NOT NULL
                    OR form_published_at IS NOT NULL'
            INTO v_filled;
    END IF;
    IF v_filled > 0 THEN
        RAISE EXCEPTION '0041: % checklist_templates row(s) hold form_code/form_revision/form_published_at; move them to items before dropping', v_filled;
    END IF;
END $$;

ALTER TABLE checklist_templates
    DROP COLUMN IF EXISTS form_published_at,
    DROP COLUMN IF EXISTS form_revision,
    DROP COLUMN IF EXISTS form_code;

CREATE UNIQUE INDEX IF NOT EXISTS uq_checklist_template_items_template_seed_key
    ON checklist_template_items (template_id, seed_key)
    WHERE seed_key IS NOT NULL;

UPDATE checklist_templates t
   SET name = r.new_name
  FROM (VALUES
        ('Default EoL Template (16 items, Branch + Depot)', 'Default EoL Template (Branch + Depot)'),
        ('Default Customer Vehicle Checklist (43 items)',   'Default Customer Vehicle Checklist'),
        ('Default Test Checklist (45 items)',               'Default Test Checklist')
       ) AS r(old_name, new_name)
 WHERE t.name = r.old_name;
