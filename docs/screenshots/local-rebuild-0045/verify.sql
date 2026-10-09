-- Read-only checks after the 0045 rebuild (migrations 0001-0045, seed
-- 01/02/03/05, one admin, reset_and_load_vins.sql). Run as karea_ro:
--   psql "postgres://karea_ro@localhost:5432/karea" -X -f verify.sql
\pset footer off

\echo '== schema version'
SELECT version, dirty FROM schema_migrations;

\echo '== templates per type (no SHIPMENT expected)'
SELECT t.type, t.name, t.is_active, count(i.id) AS items
FROM checklist_templates t LEFT JOIN checklist_template_items i ON i.template_id = t.id
GROUP BY t.id ORDER BY t.type;

\echo '== EOL items by phase (expect BRANCH 46, DEPOT 58)'
SELECT i.eol_phase, count(*) FROM checklist_template_items i
JOIN checklist_templates t ON t.id = i.template_id
WHERE t.type = 'EOL' AND i.is_active GROUP BY 1 ORDER BY 1;

\echo '== vehicles.shipment_template_id column (expect 0)'
SELECT count(*) FROM information_schema.columns
WHERE table_name = 'vehicles' AND column_name = 'shipment_template_id';

\echo '== CHECK checklist_templates_type_not_shipment (expect 1)'
SELECT count(*) FROM pg_constraint WHERE conname = 'checklist_templates_type_not_shipment';

\echo '== progress rows per type'
SELECT checklist_type, check_status, count(*) FROM checklist_item_progress GROUP BY 1, 2 ORDER BY 1, 2;

\echo '== SHIPMENT progress rows (expect 0)'
SELECT count(*) FROM checklist_item_progress WHERE checklist_type = 'SHIPMENT';

\echo '== vehicles (expect 500) and per-vehicle EOL/TEST row counts (expect one row: 104 | 43 | 500)'
SELECT count(*) FROM vehicles;
SELECT eol, test, count(*) AS vehicles FROM (
  SELECT v.vin,
         count(*) FILTER (WHERE p.checklist_type = 'EOL') AS eol,
         count(*) FILTER (WHERE p.checklist_type = 'TEST') AS test
  FROM vehicles v LEFT JOIN checklist_item_progress p ON p.vin = v.vin
  GROUP BY v.vin) s
GROUP BY 1, 2 ORDER BY 1, 2;

\echo '== shipment permissions (expect 0 rows)'
SELECT code FROM permissions WHERE code LIKE 'checklist.shipment%';

\echo '== permission catalogue'
SELECT code FROM permissions ORDER BY code;

\echo '== users (no hashes)'
SELECT u.id, u.email, r.code AS role, u.is_active, u.must_change_password
FROM users u JOIN roles r ON r.id = u.role_id ORDER BY u.id;

\echo '== materialize signature (expect 3 args)'
SELECT p.oid::regprocedure FROM pg_proc p WHERE p.proname = 'fn_materialize_vehicle_progress';
