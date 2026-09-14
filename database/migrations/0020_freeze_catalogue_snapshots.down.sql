ALTER TABLE issue_list
    DROP COLUMN IF EXISTS defect_part_name_tr,
    DROP COLUMN IF EXISTS defect_part_name_en,
    DROP COLUMN IF EXISTS defect_type_name_tr,
    DROP COLUMN IF EXISTS defect_type_name_en;

ALTER TABLE checklist_item_progress
    DROP COLUMN IF EXISTS item_text_snapshot;
