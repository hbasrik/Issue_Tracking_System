-- Read-only checks after a fresh install (migrations, seed 01/02/03/05,
-- admin, reset_and_load_vins.sql). Run as karea_ro:
--   psql "postgres://karea_ro@localhost:5432/karea" -X -f verify.sql
\pset footer off

\echo '== schema version'
SELECT version, dirty FROM schema_migrations;

\echo '== templates: total / active items'
SELECT t.id, t.type, t.name, count(i.id) AS items,
       count(i.id) FILTER (WHERE i.is_active) AS active
FROM checklist_templates t
LEFT JOIN checklist_template_items i ON i.template_id = t.id
GROUP BY 1, 2, 3 ORDER BY 1;

\echo '== EOL: branch / depot split (active items)'
SELECT i.eol_phase, count(*) AS items, min(i.item_no), max(i.item_no)
FROM checklist_template_items i
JOIN checklist_templates t ON t.id = i.template_id AND t.type = 'EOL'
WHERE i.is_active
GROUP BY 1 ORDER BY 1;

\echo '== EOL: acceptance criterion / control method filled'
SELECT count(*) AS items,
       count(*) FILTER (WHERE nullif(btrim(acceptance_criterion), '') IS NOT NULL) AS with_criterion,
       count(*) FILTER (WHERE nullif(btrim(control_method), '') IS NOT NULL) AS with_method,
       count(*) FILTER (WHERE form_code IS NOT NULL) AS form_items
FROM checklist_template_items i
JOIN checklist_templates t ON t.id = i.template_id AND t.type = 'EOL';

\echo '== EOL: per form'
SELECT coalesce(form_code, '(kept pre-form)') AS form, eol_phase, count(*),
       count(*) FILTER (WHERE nullif(btrim(acceptance_criterion), '') IS NOT NULL) AS with_criterion,
       count(*) FILTER (WHERE nullif(btrim(control_method), '') IS NOT NULL) AS with_method
FROM checklist_template_items i
JOIN checklist_templates t ON t.id = i.template_id AND t.type = 'EOL'
GROUP BY 1, 2 ORDER BY 1, 2;

\echo '== the six replaced items must be absent (expect 0 rows)'
SELECT i.id, i.item_no, i.item_text, i.is_active
FROM checklist_template_items i
JOIN checklist_templates t ON t.id = i.template_id AND t.type = 'EOL'
WHERE i.item_text IN ('Software Update', 'Fonksiyonel Komponet Kontrolü',
                      'EE Check', 'Görsel Kontrol', 'Görsel Kontrol 2',
                      'Depo Sürüş');

\echo '== kept pre-form items and their sections (expect 9)'
SELECT i.item_no, i.eol_phase, i.section_key, i.item_text
FROM checklist_template_items i
JOIN checklist_templates t ON t.id = i.template_id AND t.type = 'EOL'
WHERE i.form_code IS NULL
ORDER BY i.item_no;

\echo '== EOL sections'
SELECT i.eol_phase, i.section_sort, i.section_key, count(*), min(i.item_no), max(i.item_no)
FROM checklist_template_items i
JOIN checklist_templates t ON t.id = i.template_id AND t.type = 'EOL'
GROUP BY 1, 2, 3 ORDER BY 1, 2;

\echo '== vehicles and EOL rows per vehicle'
SELECT (SELECT count(*) FROM vehicles) AS vehicles,
       min(n) AS min_eol_rows, max(n) AS max_eol_rows,
       count(*) FILTER (WHERE n <> 104) AS vehicles_not_104
FROM (SELECT v.vin, count(p.id) AS n
      FROM vehicles v
      LEFT JOIN checklist_item_progress p ON p.vin = v.vin AND p.checklist_type = 'EOL'
      GROUP BY v.vin) s;

\echo '== all progress rows by type'
SELECT checklist_type, count(*), count(DISTINCT vin) FROM checklist_item_progress GROUP BY 1 ORDER BY 1;

\echo '== users'
SELECT u.id, u.email, r.code AS role, u.is_active, u.must_change_password
FROM users u JOIN roles r ON r.id = u.role_id ORDER BY u.id;

\echo '== operational tables'
SELECT (SELECT count(*) FROM issue_list) AS issues,
       (SELECT count(*) FROM media_attachments) AS media,
       (SELECT count(*) FROM audit_logs) AS audit_logs,
       (SELECT count(*) FROM stations) AS stations,
       (SELECT count(*) FROM defect_parts) AS defect_parts;
