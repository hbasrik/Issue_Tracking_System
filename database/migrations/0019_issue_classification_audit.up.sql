-- Tour C: audit event for issue defect-classification edits.
ALTER TYPE audit_event_enum ADD VALUE IF NOT EXISTS 'ISSUE_CLASSIFICATION_CHANGE';
