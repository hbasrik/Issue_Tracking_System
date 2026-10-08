-- Reverts 0042. fn_enforce_checklist_frozen gets back the exact 0040 body
-- (verified by md5 of pg_get_functiondef); the function is restored before
-- the columns go, because the 0042 body references them. Dropping the
-- columns loses every criterion / method / revision copy taken since 0042.
-- Idempotent.

CREATE OR REPLACE FUNCTION fn_enforce_checklist_frozen()
RETURNS TRIGGER AS $$
DECLARE
    v_reason TEXT;
BEGIN
    IF TG_OP = 'INSERT' AND NEW.check_status = 'PENDING' THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' AND (
        NEW.vin, NEW.checklist_type, NEW.check_item_id,
        NEW.check_status, NEW.checker_id, NEW.check_date, NEW.check_image_url,
        NEW.rework_desc, NEW.rework_date, NEW.conditional_desc, NEW.conditional_date,
        NEW.rejected_desc, NEW.rejected_date, NEW.rejected_by,
        NEW.approved_desc, NEW.approved_date, NEW.approved_by
    ) IS NOT DISTINCT FROM (
        OLD.vin, OLD.checklist_type, OLD.check_item_id,
        OLD.check_status, OLD.checker_id, OLD.check_date, OLD.check_image_url,
        OLD.rework_desc, OLD.rework_date, OLD.conditional_desc, OLD.conditional_date,
        OLD.rejected_desc, OLD.rejected_date, OLD.rejected_by,
        OLD.approved_desc, OLD.approved_date, OLD.approved_by
    ) THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        v_reason := fn_checklist_item_frozen_reason(OLD.vin, OLD.checklist_type, OLD.check_item_id);
        IF v_reason IS NOT NULL THEN
            RAISE EXCEPTION '%', v_reason;
        END IF;
    END IF;

    v_reason := fn_checklist_item_frozen_reason(NEW.vin, NEW.checklist_type, NEW.check_item_id);
    IF v_reason IS NOT NULL THEN
        RAISE EXCEPTION '%', v_reason;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE checklist_item_progress
    DROP CONSTRAINT IF EXISTS chk_criteria_snapshot_stamped;

ALTER TABLE checklist_item_progress
    DROP COLUMN IF EXISTS criteria_snapshot_at,
    DROP COLUMN IF EXISTS form_revision_snapshot,
    DROP COLUMN IF EXISTS control_method_snapshot,
    DROP COLUMN IF EXISTS acceptance_criterion_snapshot;
