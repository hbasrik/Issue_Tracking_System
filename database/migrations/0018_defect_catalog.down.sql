DROP INDEX IF EXISTS idx_issue_list_defect_type;
DROP INDEX IF EXISTS idx_issue_list_defect_part;

ALTER TABLE issue_list
    DROP COLUMN IF EXISTS defect_code,
    DROP COLUMN IF EXISTS custom_defect_name,
    DROP COLUMN IF EXISTS custom_part_name,
    DROP COLUMN IF EXISTS responsible_process_id,
    DROP COLUMN IF EXISTS defect_type_id,
    DROP COLUMN IF EXISTS defect_part_id;

DROP TABLE IF EXISTS defect_types;
DROP TABLE IF EXISTS defect_parts;
DROP TABLE IF EXISTS defect_zones;
DROP TABLE IF EXISTS defect_processes;
