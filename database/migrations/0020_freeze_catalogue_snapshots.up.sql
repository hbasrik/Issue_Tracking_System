-- Freeze catalogue text onto evaluated rows so history does not rewrite
-- when masters are renamed later.
--
-- Intentionally NO backfill: legacy rows keep NULL snapshots and display
-- falls back to the live catalogue name (we cannot recover the past label).

ALTER TABLE checklist_item_progress
    ADD COLUMN item_text_snapshot VARCHAR(250);

COMMENT ON COLUMN checklist_item_progress.item_text_snapshot IS
    'Item text frozen at first non-PENDING evaluation. NULL for PENDING and legacy rows; UI falls back to checklist_template_items.item_text.';

ALTER TABLE issue_list
    ADD COLUMN defect_part_name_tr VARCHAR(120),
    ADD COLUMN defect_type_name_tr VARCHAR(120),
    ADD COLUMN defect_part_name_en VARCHAR(120),
    ADD COLUMN defect_type_name_en VARCHAR(120);

COMMENT ON COLUMN issue_list.defect_part_name_tr IS
    'Part name (TR) frozen at create/classification edit. NULL for legacy; display falls back to defect_parts.name_tr.';
COMMENT ON COLUMN issue_list.defect_part_name_en IS
    'Part name (EN) frozen at create/classification edit. NULL for legacy; display falls back to defect_parts.name_en.';
COMMENT ON COLUMN issue_list.defect_type_name_tr IS
    'Defect type name (TR) frozen at create/classification edit. NULL for legacy; display falls back to defect_types.name_tr.';
COMMENT ON COLUMN issue_list.defect_type_name_en IS
    'Defect type name (EN) frozen at create/classification edit. NULL for legacy; display falls back to defect_types.name_en.';
