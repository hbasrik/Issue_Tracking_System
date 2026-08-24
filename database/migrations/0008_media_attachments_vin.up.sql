-- Karar 11: real vin column on media_attachments (nullable add, backfill, then NOT NULL).

ALTER TABLE media_attachments
    ADD COLUMN vin VARCHAR(17) REFERENCES vehicles(vin) ON DELETE CASCADE;

COMMENT ON COLUMN media_attachments.vin IS
    'Karar 11: denormalized vehicle key so Vehicle Detail can list every photo for a VIN without resolving the polymorphic entity_id.';

-- ISSUE / ISSUE_RESOLUTION → issue_list.vin
UPDATE media_attachments m
SET vin = i.vin
FROM issue_list i
WHERE m.entity_type IN ('ISSUE', 'ISSUE_RESOLUTION')
  AND m.entity_id = i.id::text;

-- CHECKLIST_ITEM_PROGRESS → checklist_item_progress.vin
UPDATE media_attachments m
SET vin = c.vin
FROM checklist_item_progress c
WHERE m.entity_type = 'CHECKLIST_ITEM_PROGRESS'
  AND m.entity_id = c.id::text;

-- STATION_STEP_PROGRESS → vehicle_station_step_progress.vin
UPDATE media_attachments m
SET vin = p.vin
FROM vehicle_station_step_progress p
WHERE m.entity_type = 'STATION_STEP_PROGRESS'
  AND m.entity_id = p.id::text;

-- VEHICLE → entity_id is already the VIN
UPDATE media_attachments m
SET vin = v.vin
FROM vehicles v
WHERE m.entity_type = 'VEHICLE'
  AND m.entity_id = v.vin;

-- Parent rows may have been deleted while media_attachments survived (no
-- polymorphic FK). Recover ISSUE* VINs from audit_logs when the issue is gone.
UPDATE media_attachments m
SET vin = a.vin
FROM (
    SELECT DISTINCT ON ((metadata->>'issue_id'))
           metadata->>'issue_id' AS issue_id,
           vin
    FROM audit_logs
    WHERE metadata ? 'issue_id'
    ORDER BY metadata->>'issue_id', event_at DESC
) a
WHERE m.vin IS NULL
  AND m.entity_type IN ('ISSUE', 'ISSUE_RESOLUTION')
  AND m.entity_id = a.issue_id
  AND EXISTS (SELECT 1 FROM vehicles v WHERE v.vin = a.vin);

-- Remaining NULLs cannot satisfy the new FK (parent gone, no audit trail).
DELETE FROM media_attachments WHERE vin IS NULL;

DO $$
DECLARE
    n INT;
BEGIN
    SELECT count(*) INTO n FROM media_attachments WHERE vin IS NULL;
    IF n > 0 THEN
        RAISE EXCEPTION 'media_attachments.vin backfill left % NULL rows', n;
    END IF;
END $$;

ALTER TABLE media_attachments ALTER COLUMN vin SET NOT NULL;

CREATE INDEX idx_media_attachments_vin ON media_attachments (vin);
