-- Reverse of 0041. Values written to the four item-level form columns are lost
-- on rollback; the template-level columns come back empty (they were empty
-- when 0041 dropped them, enforced by its guard).

UPDATE checklist_templates t
   SET name = r.old_name
  FROM (VALUES
        ('Default EoL Template (16 items, Branch + Depot)', 'Default EoL Template (Branch + Depot)'),
        ('Default Customer Vehicle Checklist (43 items)',   'Default Customer Vehicle Checklist'),
        ('Default Test Checklist (45 items)',               'Default Test Checklist')
       ) AS r(old_name, new_name)
 WHERE t.name = r.new_name;

DROP INDEX IF EXISTS uq_checklist_template_items_template_seed_key;

ALTER TABLE checklist_templates
    ADD COLUMN IF NOT EXISTS form_code         TEXT NULL,
    ADD COLUMN IF NOT EXISTS form_revision     TEXT NULL,
    ADD COLUMN IF NOT EXISTS form_published_at DATE NULL;

ALTER TABLE checklist_template_items
    DROP COLUMN IF EXISTS form_published_at,
    DROP COLUMN IF EXISTS form_revision,
    DROP COLUMN IF EXISTS form_item_ref,
    DROP COLUMN IF EXISTS form_code;
