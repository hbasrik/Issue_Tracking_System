DROP INDEX IF EXISTS uq_issue_list_client_request_id;

ALTER TABLE issue_list
    DROP COLUMN IF EXISTS client_request_id;
