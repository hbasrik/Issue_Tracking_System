-- Reverse Karar 11: drop the vin column and its index.

DROP INDEX IF EXISTS idx_media_attachments_vin;

ALTER TABLE media_attachments DROP COLUMN IF EXISTS vin;
