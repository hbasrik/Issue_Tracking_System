-- Restore prior seed defaults for the cleared codes (best-effort reverse).
UPDATE defect_types t
SET default_process_id = p.id,
    updated_at = now()
FROM defect_processes p
WHERE t.code = '01' AND p.code = 'ASSEMBLY';

UPDATE defect_types t
SET default_process_id = p.id,
    updated_at = now()
FROM defect_processes p
WHERE t.code = '03' AND p.code = 'ASSEMBLY';

UPDATE defect_types t
SET default_process_id = p.id,
    updated_at = now()
FROM defect_processes p
WHERE t.code = '04' AND p.code = 'WELD';

UPDATE defect_types t
SET default_process_id = p.id,
    updated_at = now()
FROM defect_processes p
WHERE t.code = '07' AND p.code = 'ASSEMBLY';

UPDATE defect_types t
SET default_process_id = p.id,
    updated_at = now()
FROM defect_processes p
WHERE t.code = '09' AND p.code = 'ASSEMBLY';
