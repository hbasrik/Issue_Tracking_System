-- Add MANUAL to issue_source_enum only.
-- Postgres forbids using a newly added enum label in the same transaction
-- as ADD VALUE, so the CHECK / seed changes live in 0006.
ALTER TYPE issue_source_enum ADD VALUE IF NOT EXISTS 'MANUAL';
