DROP TRIGGER IF EXISTS trg_enforce_eol_depot_after_branch ON checklist_item_progress;
DROP FUNCTION IF EXISTS fn_enforce_eol_depot_after_branch();

ALTER TABLE checklist_item_progress
    DROP CONSTRAINT IF EXISTS chk_description_required_by_status;

ALTER TABLE checklist_item_progress
    ADD CONSTRAINT chk_description_required_by_status CHECK (
        check_status IN ('PENDING', 'OK')
        OR (check_status = 'NOT_OK' AND rejected_desc IS NOT NULL)
        OR (check_status = 'REWORK' AND rework_desc IS NOT NULL)
        OR (check_status = 'CONDITIONAL_OK' AND conditional_desc IS NOT NULL)
    );
