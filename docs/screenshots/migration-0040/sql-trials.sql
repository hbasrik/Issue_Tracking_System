-- Migration 0040 direct-SQL trials on karea_eolnote_test (0040 applied).
-- Everything runs in one transaction that is rolled back; each attempt is in
-- its own savepoint. After the attempts the probed rows, the media rows and
-- the audit log of the probed vehicles are compared with their state before.
--   psql "$T" -X -f docs/screenshots/migration-0040/sql-trials.sql
\set ON_ERROR_STOP 0
BEGIN;
-- N7V1K1SA1TK000012: depot (branch shipped, depot not released).
-- N7V1K1SA3TK000013: depot released, not delivered.
-- N7V1K1SA2TK000018: depot released, delivered here inside the transaction.
-- N7V1K1SA9TK000002: branch stage.
-- N7V1K1SAXTK000011: depot, all depot items OK, no open issue.
UPDATE vehicle_eol_workflow SET delivered_at = now(), delivered_by = (SELECT min(id) FROM users)
 WHERE vin = 'N7V1K1SA2TK000018';
SELECT v.vin, v.current_global_status, w.current_stage,
       w.branch_shipped_at IS NOT NULL AS branch_shipped, w.depot_released_at IS NOT NULL AS depot_released
FROM vehicles v JOIN vehicle_eol_workflow w USING (vin)
WHERE v.vin IN ('N7V1K1SA1TK000012','N7V1K1SA3TK000013','N7V1K1SA2TK000018','N7V1K1SA9TK000002','N7V1K1SAXTK000011')
ORDER BY v.vin;

CREATE TEMP TABLE probe AS
SELECT p.id, p.vin, p.checklist_type::text AS type, COALESCE(c.eol_phase::text, '-') AS phase, c.item_no,
       md5(p::text) AS before
FROM checklist_item_progress p JOIN checklist_template_items c ON c.id = p.check_item_id
WHERE (p.vin IN ('N7V1K1SA1TK000012','N7V1K1SA3TK000013','N7V1K1SA2TK000018','N7V1K1SA9TK000002')
       AND ((p.checklist_type = 'EOL' AND c.item_no IN (1, 15))
            OR (p.checklist_type IN ('TEST','SHIPMENT') AND c.item_no = 1)));
SELECT id, vin, type, phase, item_no FROM probe ORDER BY vin, type, item_no;
CREATE TEMP TABLE audit_before AS
SELECT vin, count(*) AS n, md5(string_agg(a::text, '|' ORDER BY a.id)) AS h
FROM audit_logs a WHERE vin IN (SELECT DISTINCT vin FROM probe) GROUP BY vin;
CREATE TEMP TABLE media_before AS SELECT count(*) AS n FROM media_attachments;

\echo
\echo '== checklist_item_progress =='
\echo '-- 1. depot vehicle, EOL branch item -> NOT_OK (must fail: branch stage)'
SAVEPOINT s; UPDATE checklist_item_progress SET check_status = 'NOT_OK', rejected_desc = 'sql probe' WHERE id = (SELECT id FROM probe WHERE vin = 'N7V1K1SA1TK000012' AND type = 'EOL' AND item_no = 1); ROLLBACK TO s;
\echo '-- 2. depot vehicle, TEST item -> NOT_OK (must fail: branch stage)'
SAVEPOINT s; UPDATE checklist_item_progress SET check_status = 'NOT_OK' WHERE id = (SELECT id FROM probe WHERE vin = 'N7V1K1SA1TK000012' AND type = 'TEST'); ROLLBACK TO s;
\echo '-- 3. depot vehicle, SHIPMENT item -> CONDITIONAL_OK (must fail: branch stage)'
SAVEPOINT s; UPDATE checklist_item_progress SET check_status = 'CONDITIONAL_OK', conditional_desc = 'sql probe' WHERE id = (SELECT id FROM probe WHERE vin = 'N7V1K1SA1TK000012' AND type = 'SHIPMENT'); ROLLBACK TO s;
\echo '-- 4. depot vehicle, EOL depot item -> OK (must pass: depot not released)'
SAVEPOINT s; UPDATE checklist_item_progress SET check_status = 'OK', approved_desc = 'sql probe ok' WHERE id = (SELECT id FROM probe WHERE vin = 'N7V1K1SA1TK000012' AND type = 'EOL' AND item_no = 15) RETURNING id, check_status; ROLLBACK TO s;
\echo '-- 5. depot-released vehicle, EOL depot item -> NOT_OK (must fail: depot stage)'
SAVEPOINT s; UPDATE checklist_item_progress SET check_status = 'NOT_OK', rejected_desc = 'sql probe' WHERE id = (SELECT id FROM probe WHERE vin = 'N7V1K1SA3TK000013' AND type = 'EOL' AND item_no = 15); ROLLBACK TO s;
\echo '-- 6. depot-released vehicle, TEST item -> NOT_OK (must fail: branch stage)'
SAVEPOINT s; UPDATE checklist_item_progress SET check_status = 'NOT_OK' WHERE id = (SELECT id FROM probe WHERE vin = 'N7V1K1SA3TK000013' AND type = 'TEST'); ROLLBACK TO s;
\echo '-- 7. delivered vehicle, EOL branch item -> NOT_OK (must fail: delivered)'
SAVEPOINT s; UPDATE checklist_item_progress SET check_status = 'NOT_OK', rejected_desc = 'sql probe' WHERE id = (SELECT id FROM probe WHERE vin = 'N7V1K1SA2TK000018' AND type = 'EOL' AND item_no = 1); ROLLBACK TO s;
\echo '-- 8. delivered vehicle, EOL depot item -> NOT_OK (must fail: delivered)'
SAVEPOINT s; UPDATE checklist_item_progress SET check_status = 'NOT_OK', rejected_desc = 'sql probe' WHERE id = (SELECT id FROM probe WHERE vin = 'N7V1K1SA2TK000018' AND type = 'EOL' AND item_no = 15); ROLLBACK TO s;
\echo '-- 9. delivered vehicle, SHIPMENT item -> NOT_OK (must fail: delivered)'
SAVEPOINT s; UPDATE checklist_item_progress SET check_status = 'NOT_OK' WHERE id = (SELECT id FROM probe WHERE vin = 'N7V1K1SA2TK000018' AND type = 'SHIPMENT'); ROLLBACK TO s;
\echo '-- 10. delivered vehicle, note-only change on branch item (must fail: delivered)'
SAVEPOINT s; UPDATE checklist_item_progress SET approved_desc = 'sql probe note' WHERE id = (SELECT id FROM probe WHERE vin = 'N7V1K1SA2TK000018' AND type = 'EOL' AND item_no = 1); ROLLBACK TO s;
\echo '-- 11. delivered vehicle, move frozen answer to another item (must fail: delivered)'
SAVEPOINT s; UPDATE checklist_item_progress SET check_item_id = check_item_id + 0, vin = 'N7V1K1SA9TK000002' WHERE id = (SELECT id FROM probe WHERE vin = 'N7V1K1SA2TK000018' AND type = 'EOL' AND item_no = 1); ROLLBACK TO s;
\echo '-- 12. delivered vehicle, related_issue_id / item_text_snapshot only (must pass: issue link, snapshot)'
SAVEPOINT s; UPDATE checklist_item_progress SET related_issue_id = related_issue_id, item_text_snapshot = item_text_snapshot WHERE id = (SELECT id FROM probe WHERE vin = 'N7V1K1SA2TK000018' AND type = 'EOL' AND item_no = 1) RETURNING id; ROLLBACK TO s;
\echo '-- 13. delivered vehicle, INSERT PENDING row for a new item (must pass), then an answered row (must fail)'
SAVEPOINT s;
INSERT INTO checklist_template_items (template_id, item_no, item_text, eol_phase)
SELECT eol_template_id, 990, 'TMP_M40 probe', 'BRANCH' FROM vehicles WHERE vin = 'N7V1K1SA2TK000018' RETURNING id AS tmp_item \gset
INSERT INTO checklist_item_progress (vin, checklist_type, check_item_id, check_status) VALUES ('N7V1K1SA2TK000018', 'EOL', :tmp_item, 'PENDING') RETURNING id, check_status;
SAVEPOINT s2;
INSERT INTO checklist_item_progress (vin, checklist_type, check_item_id, check_status) VALUES ('N7V1K1SA2TK000018', 'TEST', :tmp_item, 'OK') ON CONFLICT DO NOTHING;
ROLLBACK TO s;
\echo '-- 14. branch-stage vehicle, EOL branch item and TEST item -> OK (must pass: lock does not over-close)'
SAVEPOINT s;
UPDATE checklist_item_progress SET check_status = 'OK', approved_desc = 'sql probe ok' WHERE id IN (SELECT id FROM probe WHERE vin = 'N7V1K1SA9TK000002' AND item_no = 1 AND type IN ('EOL','TEST')) RETURNING id, checklist_type, check_status;
ROLLBACK TO s;

\echo
\echo '== media_attachments =='
\echo '-- 15. photo on depot vehicle EOL branch item (must fail: branch stage)'
SAVEPOINT s; INSERT INTO media_attachments (entity_type, entity_id, vin, file_name, storage_path, mime_type, file_size)
SELECT 'CHECKLIST_ITEM_PROGRESS', id::text, vin, 'probe.jpg', 'probe/probe.jpg', 'image/jpeg', 1 FROM probe WHERE vin = 'N7V1K1SA1TK000012' AND type = 'EOL' AND item_no = 1; ROLLBACK TO s;
\echo '-- 16. photo on depot vehicle TEST item (must fail: branch stage)'
SAVEPOINT s; INSERT INTO media_attachments (entity_type, entity_id, vin, file_name, storage_path, mime_type, file_size)
SELECT 'CHECKLIST_ITEM_PROGRESS', id::text, vin, 'probe.jpg', 'probe/probe.jpg', 'image/jpeg', 1 FROM probe WHERE vin = 'N7V1K1SA1TK000012' AND type = 'TEST'; ROLLBACK TO s;
\echo '-- 17. photo on depot-released vehicle EOL depot item (must fail: depot stage)'
SAVEPOINT s; INSERT INTO media_attachments (entity_type, entity_id, vin, file_name, storage_path, mime_type, file_size)
SELECT 'CHECKLIST_ITEM_PROGRESS', id::text, vin, 'probe.jpg', 'probe/probe.jpg', 'image/jpeg', 1 FROM probe WHERE vin = 'N7V1K1SA3TK000013' AND type = 'EOL' AND item_no = 15; ROLLBACK TO s;
\echo '-- 18. photo on delivered vehicle SHIPMENT item (must fail: delivered)'
SAVEPOINT s; INSERT INTO media_attachments (entity_type, entity_id, vin, file_name, storage_path, mime_type, file_size)
SELECT 'CHECKLIST_ITEM_PROGRESS', id::text, vin, 'probe.jpg', 'probe/probe.jpg', 'image/jpeg', 1 FROM probe WHERE vin = 'N7V1K1SA2TK000018' AND type = 'SHIPMENT'; ROLLBACK TO s;
\echo '-- 19. photo on depot vehicle EOL depot item and branch-stage EOL item (must pass)'
SAVEPOINT s; INSERT INTO media_attachments (entity_type, entity_id, vin, file_name, storage_path, mime_type, file_size)
SELECT 'CHECKLIST_ITEM_PROGRESS', id::text, vin, 'probe.jpg', 'probe/probe.jpg', 'image/jpeg', 1 FROM probe
 WHERE (vin = 'N7V1K1SA1TK000012' AND type = 'EOL' AND item_no = 15) OR (vin = 'N7V1K1SA9TK000002' AND type = 'EOL' AND item_no = 1)
RETURNING entity_id, vin; ROLLBACK TO s;
\echo '-- 20. non-checklist photo on a delivered vehicle (must pass: only checklist photos freeze)'
SAVEPOINT s; INSERT INTO media_attachments (entity_type, entity_id, vin, file_name, storage_path, mime_type, file_size)
VALUES ('VEHICLE', 'N7V1K1SA2TK000018', 'N7V1K1SA2TK000018', 'probe.jpg', 'probe/probe.jpg', 'image/jpeg', 1) RETURNING entity_type; ROLLBACK TO s;
\echo '-- 21. existing photo stays readable after its item freezes; editing it fails'
SAVEPOINT s;
INSERT INTO media_attachments (entity_type, entity_id, vin, file_name, storage_path, mime_type, file_size)
SELECT 'CHECKLIST_ITEM_PROGRESS', p.id::text, p.vin, 'before-freeze.jpg', 'probe/before-freeze.jpg', 'image/jpeg', 1
FROM checklist_item_progress p JOIN checklist_template_items c ON c.id = p.check_item_id
WHERE p.vin = 'N7V1K1SAXTK000011' AND c.eol_phase = 'DEPOT' AND c.item_no = 15
RETURNING id AS tmp_media, entity_id AS tmp_entity \gset
UPDATE vehicle_eol_workflow SET depot_released_at = now(), depot_released_by = (SELECT min(id) FROM users) WHERE vin = 'N7V1K1SAXTK000011' RETURNING vin, current_stage;
SELECT id, file_name, storage_path FROM media_attachments WHERE id = :tmp_media;
SAVEPOINT s2;
UPDATE media_attachments SET file_name = 'renamed.jpg' WHERE id = :tmp_media;
ROLLBACK TO s2;
INSERT INTO media_attachments (entity_type, entity_id, vin, file_name, storage_path, mime_type, file_size)
VALUES ('CHECKLIST_ITEM_PROGRESS', :'tmp_entity', 'N7V1K1SAXTK000011', 'after-freeze.jpg', 'probe/after-freeze.jpg', 'image/jpeg', 1);
ROLLBACK TO s;

\echo
\echo '== state after every attempt =='
SELECT pr.vin, pr.type, pr.phase, pr.item_no, md5(p::text) = pr.before AS row_unchanged
FROM probe pr JOIN checklist_item_progress p ON p.id = pr.id ORDER BY pr.vin, pr.type, pr.item_no;
SELECT b.vin, b.n AS audit_rows_before, a.n AS audit_rows_after, a.h = b.h AS audit_unchanged
FROM audit_before b
LEFT JOIN (SELECT vin, count(*) AS n, md5(string_agg(x::text, '|' ORDER BY x.id)) AS h FROM audit_logs x GROUP BY vin) a USING (vin)
ORDER BY b.vin;
SELECT (SELECT n FROM media_before) AS media_rows_before, count(*) AS media_rows_after FROM media_attachments;
ROLLBACK;
