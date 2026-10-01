-- "Diğer" (part 99-99) catches whatever the catalogue misses, so it must not
-- disappear when a real zone is closed. Until now it sat under Body (zone 10)
-- only to satisfy the NOT NULL zone_id FK. Give it a dedicated zone 99.
--
-- Data-only: the part keeps its id and code, so issue_list.defect_part_id,
-- defect_code (99-99-xx) and the name snapshots of existing issues are
-- untouched. Only the zone shown for those issues changes from Body to Diğer.
-- Idempotent: safe to re-run.

INSERT INTO defect_zones (code, name_tr, name_en, sort_order, is_active)
VALUES ('99', 'Diğer', 'Other', 99, TRUE)
ON CONFLICT (code) DO NOTHING;

UPDATE defect_parts p
SET zone_id = z.id,
    updated_at = now()
FROM defect_zones z
WHERE z.code = '99'
  AND p.code = '99-99'
  AND p.zone_id IS DISTINCT FROM z.id;
