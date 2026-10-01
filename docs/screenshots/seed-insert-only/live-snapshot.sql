-- Read-only snapshot of checklist_template_items, run before and after
-- migration 0034 on the live database:
--   PGOPTIONS='-c default_transaction_read_only=on' psql ... -f live-snapshot.sql
-- The fingerprints cover every column that existed before 0034, so seed_key
-- itself is excluded and before/after hashes must be identical.

SELECT 'schema_migrations version=' || version || ' dirty=' || dirty AS migration
FROM schema_migrations;

SELECT
    count(*) AS all_items,
    count(*) FILTER (WHERE is_active) AS active,
    count(*) FILTER (WHERE NOT is_active) AS inactive,
    md5(string_agg(id || '|' || template_id || '|' || item_no || '|' || item_text || '|' || is_active
                   || '|' || COALESCE(eol_phase::text, '') || '|' || COALESCE(section_key, '')
                   || '|' || COALESCE(section_sort::text, '') || '|' || COALESCE(station_id::text, ''),
                   E'\n' ORDER BY id)) AS full_fingerprint,
    md5(string_agg(id || '|' || item_text, E'\n' ORDER BY id)) AS text_fingerprint,
    md5(string_agg(id || '|' || template_id || '|' || item_no, E'\n' ORDER BY id)) AS order_fingerprint,
    md5(string_agg(id || '|' || is_active, E'\n' ORDER BY id)) AS active_fingerprint
FROM checklist_template_items;

SELECT t.name AS template,
       count(*) AS items,
       count(*) FILTER (WHERE NOT i.is_active) AS inactive,
       md5(string_agg(i.id || '|' || i.item_no || '|' || i.item_text || '|' || i.is_active, E'\n' ORDER BY i.id)) AS fingerprint
FROM checklist_template_items i
JOIN checklist_templates t ON t.id = i.template_id
GROUP BY t.name
ORDER BY t.name;

SELECT 'checklist_item_progress rows=' || count(*)
       || ' fingerprint=' || md5(string_agg(id || '|' || check_item_id, E'\n' ORDER BY id)) AS progress
FROM checklist_item_progress;
