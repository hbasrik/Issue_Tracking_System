-- Reverse 0026: keep UNIQUE (template_id, item_no) — it belongs to 0001.
-- Only drop the comment this migration added.

COMMENT ON CONSTRAINT checklist_template_items_template_id_item_no_key
    ON checklist_template_items IS NULL;
