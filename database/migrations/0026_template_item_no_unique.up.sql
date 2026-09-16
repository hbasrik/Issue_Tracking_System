-- Guarantee UNIQUE (template_id, item_no) on checklist_template_items.
-- Present since 0001 as checklist_template_items_template_id_item_no_key;
-- re-asserted here so a restored/partial schema cannot drop the race guard.
-- Idempotent: ADD CONSTRAINT only when no unique on (template_id, item_no).

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.checklist_template_items'::regclass
          AND contype = 'u'
          AND pg_get_constraintdef(oid) ILIKE '%(template_id, item_no)%'
    ) THEN
        ALTER TABLE checklist_template_items
            ADD CONSTRAINT checklist_template_items_template_id_item_no_key
            UNIQUE (template_id, item_no);
    END IF;
END $$;

COMMENT ON CONSTRAINT checklist_template_items_template_id_item_no_key
    ON checklist_template_items IS
    'Serial item_no is MAX+1; this unique key plus insert retry prevents duplicate numbers.';
