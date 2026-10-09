-- One md5 per table over every row (ordered), so a migration step that
-- touches any row shows up as a changed hash. Read-only.
SELECT 'vehicles' AS tbl, count(*) AS n, md5(string_agg(t::text, '|' ORDER BY t.vin)) FROM vehicles t
UNION ALL
SELECT 'vehicle_eol_workflow', count(*), md5(string_agg(t::text, '|' ORDER BY t.vin)) FROM vehicle_eol_workflow t
UNION ALL
SELECT 'checklist_item_progress', count(*), md5(string_agg(t::text, '|' ORDER BY t.id)) FROM checklist_item_progress t
UNION ALL
SELECT 'vehicle_station_step_progress', count(*), md5(string_agg(t::text, '|' ORDER BY t.id)) FROM vehicle_station_step_progress t
UNION ALL
SELECT 'checklist_templates', count(*), md5(string_agg(t::text, '|' ORDER BY t.id)) FROM checklist_templates t
UNION ALL
SELECT 'checklist_template_items', count(*), md5(string_agg(t::text, '|' ORDER BY t.id)) FROM checklist_template_items t
UNION ALL
SELECT 'audit_logs', count(*), md5(string_agg(t::text, '|' ORDER BY t.id)) FROM audit_logs t;
