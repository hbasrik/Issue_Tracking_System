-- Move "Diğer" back under Body and drop the dedicated zone when it is empty.
-- Idempotent: safe to re-run.

UPDATE defect_parts p
SET zone_id = z.id,
    updated_at = now()
FROM defect_zones z
WHERE z.code = '10'
  AND p.code = '99-99'
  AND p.zone_id IS DISTINCT FROM z.id;

DELETE FROM defect_zones z
WHERE z.code = '99'
  AND NOT EXISTS (SELECT 1 FROM defect_parts p WHERE p.zone_id = z.id);
