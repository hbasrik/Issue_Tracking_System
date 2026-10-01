-- Read-only snapshot of the live catalogue around migration 0033.
-- Run with PGOPTIONS='-c default_transaction_read_only=on'.
\pset footer off
SELECT current_database() AS db, current_setting('transaction_read_only') AS read_only;
SELECT version, dirty FROM schema_migrations;
SELECT id, code, name_tr, name_en, sort_order, is_active FROM defect_zones ORDER BY sort_order, id;
SELECT p.id, p.code, p.name_tr, p.is_active, p.zone_id, z.code AS zone_code, z.name_tr AS zone_name
FROM defect_parts p JOIN defect_zones z ON z.id = p.zone_id
WHERE p.code = '99-99';
SELECT z.code AS zone_code, count(*) AS parts FROM defect_parts p JOIN defect_zones z ON z.id = p.zone_id
GROUP BY z.code ORDER BY z.code;
-- Every "Diğer" issue (Other part or Other type), classification fields only.
SELECT i.id, i.defect_part_id, i.defect_type_id, i.responsible_process_id, i.defect_code,
       i.defect_part_name_tr, i.defect_type_name_tr, i.custom_part_name, i.custom_defect_name,
       i.updated_at
FROM issue_list i
LEFT JOIN defect_parts p ON p.id = i.defect_part_id
LEFT JOIN defect_types t ON t.id = i.defect_type_id
WHERE p.code = '99-99' OR t.code = '99'
ORDER BY i.id;
SELECT md5(string_agg(concat_ws('|', i.id, i.defect_part_id, i.defect_type_id, i.responsible_process_id,
                                i.defect_code, i.defect_part_name_tr, i.defect_part_name_en,
                                i.defect_type_name_tr, i.defect_type_name_en, i.custom_part_name,
                                i.custom_defect_name, i.updated_at), ',' ORDER BY i.id)) AS all_issues_classification_md5,
       count(*) AS issues
FROM issue_list i;
