-- Clear ambiguous defect-type → process defaults. Only keep mappings that
-- are reliably attributable; quality must assign the rest intentionally.
-- Does NOT rewrite existing issue_list.responsible_process_id values.

-- Keep: 02 PAINT, 05 ASSEMBLY, 06 ASSEMBLY, 08 ELECTRICAL, 99 NULL
-- Clear: 01 gap, 03 scratch/impact, 04 deformation, 07 leak, 09 NVH

UPDATE defect_types t
SET default_process_id = NULL,
    updated_at = now()
WHERE t.code IN ('01', '03', '04', '07', '09')
  AND t.default_process_id IS NOT NULL;
