-- Drop the seed identity column. Seed 03 requires it, so roll the seed file
-- back together with this migration. Idempotent: safe to re-run.

ALTER TABLE checklist_template_items DROP COLUMN IF EXISTS seed_key;
