-- Read-only scan of the live catalogue (run with default_transaction_read_only=on).
-- Reports, never fixes: malformed codes and duplicate names that the new
-- rules (docs/11 Karar 20) would reject.
\echo '== parts whose code is not <zone code>-NN (Other 99-99 excluded) =='
SELECT p.id, p.code, z.code AS zone, p.name_tr, p.is_active,
       (SELECT count(*) FROM issue_list i WHERE i.defect_part_id = p.id) AS issues
FROM defect_parts p JOIN defect_zones z ON z.id = p.zone_id
WHERE p.code <> '99-99' AND (p.code !~ ('^' || z.code || '-[0-9]{2}$') OR right(p.code, 2) = '00')
ORDER BY p.id;
\echo '== defect types whose code is not two digits =='
SELECT id, code, name_tr, is_active,
       (SELECT count(*) FROM issue_list i WHERE i.defect_type_id = t.id) AS issues
FROM defect_types t WHERE code !~ '^[0-9]{2}$' OR code = '00';
\echo '== duplicate part names within a zone (TR or EN; case, spaces, dotted/dotless i ignored) =='
WITH n AS (SELECT p.id, p.zone_id, p.code, p.name_tr, p.name_en,
  replace(lower(regexp_replace(btrim(replace(replace(p.name_tr, 'I', 'i'), 'İ', 'i')), '\s+', ' ', 'g')), 'ı', 'i') AS ntr,
  replace(lower(regexp_replace(btrim(replace(replace(p.name_en, 'I', 'i'), 'İ', 'i')), '\s+', ' ', 'g')), 'ı', 'i') AS nen
  FROM defect_parts p)
SELECT a.zone_id, a.code, a.name_tr, b.code AS dup_code, b.name_tr AS dup_name_tr
FROM n a JOIN n b ON a.zone_id = b.zone_id AND a.id < b.id AND (a.ntr = b.ntr OR a.nen = b.nen);
\echo '== duplicate defect type names =='
WITH n AS (SELECT t.id, t.code, t.name_tr, t.name_en,
  replace(lower(regexp_replace(btrim(replace(replace(t.name_tr, 'I', 'i'), 'İ', 'i')), '\s+', ' ', 'g')), 'ı', 'i') AS ntr,
  replace(lower(regexp_replace(btrim(replace(replace(t.name_en, 'I', 'i'), 'İ', 'i')), '\s+', ' ', 'g')), 'ı', 'i') AS nen
  FROM defect_types t)
SELECT a.code, a.name_tr, b.code AS dup_code, b.name_tr AS dup_name_tr
FROM n a JOIN n b ON a.id < b.id AND (a.ntr = b.ntr OR a.nen = b.nen);
\echo '== issue defect codes (snapshot) that are not NN-NN-NN =='
SELECT count(*) FILTER (WHERE defect_code IS NOT NULL) AS issues_with_code,
       count(*) FILTER (WHERE defect_code IS NOT NULL AND defect_code !~ '^[0-9]{2}-[0-9]{2}-[0-9]{2}$') AS malformed
FROM issue_list;
\echo '== totals =='
SELECT (SELECT count(*) FROM defect_zones) AS zones, (SELECT count(*) FROM defect_parts) AS parts,
       (SELECT count(*) FROM defect_types) AS types, now() AS scanned_at;
