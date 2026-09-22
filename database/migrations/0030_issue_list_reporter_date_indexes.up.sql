-- Missing indexes called out in the glossary / ops audit:
--   - issue_reporter_id (bildiren) — operator-name / reporter lookups
--   - issue_date (+ id) — board list ORDER BY issue_date DESC, id DESC
-- Idempotent: CREATE INDEX IF NOT EXISTS.

CREATE INDEX IF NOT EXISTS idx_issue_list_reporter
    ON issue_list (issue_reporter_id);

CREATE INDEX IF NOT EXISTS idx_issue_list_issue_date
    ON issue_list (issue_date DESC, id DESC);
