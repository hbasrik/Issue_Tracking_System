-- Reverse 0024: drop section columns (grouping falls back to none).

ALTER TABLE checklist_template_items
    DROP COLUMN IF EXISTS section_key,
    DROP COLUMN IF EXISTS section_sort;
