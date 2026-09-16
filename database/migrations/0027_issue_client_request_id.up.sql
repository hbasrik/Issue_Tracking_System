-- Client-supplied idempotency key for issue create (mobile offline retry).
-- NULL on existing rows; unique among non-null values so a replay cannot
-- open a second issue.

ALTER TABLE issue_list
    ADD COLUMN IF NOT EXISTS client_request_id VARCHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS uq_issue_list_client_request_id
    ON issue_list (client_request_id)
    WHERE client_request_id IS NOT NULL;

COMMENT ON COLUMN issue_list.client_request_id IS
    'Optional client idempotency key. Same key always maps to one issue row.';
