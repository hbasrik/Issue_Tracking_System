-- Read-only snapshot of the live database, run before and after migration
-- 0036:
--   PGOPTIONS='-c default_transaction_read_only=on' psql ... -f live-snapshot.sql
-- Fingerprints exclude section_key / section_sort (the only columns 0036
-- writes), so before/after hashes must be identical. The TEST section
-- fingerprint covers section columns too: 0036 must not touch TEST.

SELECT 'schema_migrations version=' || version || ' dirty=' || dirty AS migration
FROM schema_migrations;

SELECT
    count(*) AS all_items,
    count(*) FILTER (WHERE is_active) AS active,
    md5(string_agg(id || '|' || template_id || '|' || item_no || '|' || item_text || '|' || is_active
                   || '|' || COALESCE(eol_phase::text, '') || '|' || COALESCE(station_id::text, '')
                   || '|' || COALESCE(seed_key, ''),
                   E'\n' ORDER BY id)) AS non_section_fingerprint,
    md5(string_agg(id || '|' || item_text, E'\n' ORDER BY id)) AS text_fingerprint,
    md5(string_agg(id || '|' || template_id || '|' || item_no, E'\n' ORDER BY id)) AS order_fingerprint,
    md5(string_agg(id || '|' || is_active, E'\n' ORDER BY id)) AS active_fingerprint,
    md5(string_agg(id || '|' || COALESCE(section_key, '') || '|' || COALESCE(section_sort::text, ''),
                   E'\n' ORDER BY id)) AS section_fingerprint
FROM checklist_template_items;

SELECT t.type AS template_type,
       count(*) AS items,
       md5(string_agg(i.id || '|' || i.item_no || '|' || i.item_text || '|' || i.is_active
                      || '|' || COALESCE(i.section_key, '') || '|' || COALESCE(i.section_sort::text, ''),
                      E'\n' ORDER BY i.id)) AS all_columns_fingerprint
FROM checklist_template_items i
JOIN checklist_templates t ON t.id = i.template_id
GROUP BY 1
ORDER BY 1;

SELECT t.type AS template_type,
       COALESCE(i.section_key, '-') AS section_key,
       i.section_sort,
       count(*) AS items,
       count(*) FILTER (WHERE i.is_active) AS active,
       string_agg(i.item_no::text, ',' ORDER BY i.item_no) AS item_nos
FROM checklist_template_items i
JOIN checklist_templates t ON t.id = i.template_id
WHERE t.type IN ('SHIPMENT', 'TEST')
GROUP BY 1, 2, 3
ORDER BY 1, 3 NULLS LAST, 2;

-- Screen order: sections by section_sort, items by item_no (shared/checklistSections.ts).
SELECT 'SHIPMENT screen order=' || string_agg(item_no::text, ',' ORDER BY rn) AS shipment_screen_order
FROM (
    SELECT i.item_no,
           ROW_NUMBER() OVER (ORDER BY COALESCE(i.section_sort, 9999), i.section_key, i.item_no) AS rn
    FROM checklist_template_items i
    JOIN checklist_templates t ON t.id = i.template_id
    WHERE t.type = 'SHIPMENT' AND i.is_active
) s;

SELECT 'checklist_item_progress rows=' || count(*)
       || ' fingerprint=' || md5(string_agg(p::text, E'\n' ORDER BY p.id)) AS progress
FROM checklist_item_progress p;
