-- 0042: freeze the form guidance an answer was given against (docs/11 Karar 30).
--
-- Acceptance criterion, control method and form revision live on the
-- template item. When the quality team revises a form, every past answer
-- would show (and print) today's text although the vehicle was evaluated
-- against the old one. The answer row therefore keeps its own copy:
--   acceptance_criterion_snapshot  copy of checklist_template_items.acceptance_criterion
--   control_method_snapshot        copy of checklist_template_items.control_method
--   form_revision_snapshot         copy of checklist_template_items.form_revision
--   criteria_snapshot_at           when the copy was taken
-- The application copies all four on every non-PENDING answer, in the same
-- UPDATE that stores the answer. criteria_snapshot_at tells "copied, the form
-- gave none" (stamp set, copy NULL) from "never copied" (stamp NULL).
-- Rows without a stamp show no criterion; they never fall back to the
-- template, because that is exactly the wrong history this migration fixes.
--
-- Intentionally NO backfill: which criterion a past answer was given against
-- is unknown and is not invented.
--
-- fn_enforce_checklist_frozen (0040) is replaced so the four columns are part
-- of the protected answer: a frozen row's copy cannot change either. Only the
-- protected column list grows; which item freezes when is unchanged, and
-- fn_checklist_item_frozen_reason is not touched.
--
-- Additive and nullable: old code keeps working, so the migration goes first
-- and the code that writes the columns follows. No downtime. Idempotent.

ALTER TABLE checklist_item_progress
    ADD COLUMN IF NOT EXISTS acceptance_criterion_snapshot TEXT NULL,
    ADD COLUMN IF NOT EXISTS control_method_snapshot       TEXT NULL,
    ADD COLUMN IF NOT EXISTS form_revision_snapshot        TEXT NULL,
    ADD COLUMN IF NOT EXISTS criteria_snapshot_at          TIMESTAMPTZ NULL;

ALTER TABLE checklist_item_progress
    DROP CONSTRAINT IF EXISTS chk_criteria_snapshot_stamped;
ALTER TABLE checklist_item_progress
    ADD CONSTRAINT chk_criteria_snapshot_stamped CHECK (
        criteria_snapshot_at IS NOT NULL
        OR (acceptance_criterion_snapshot IS NULL
            AND control_method_snapshot IS NULL
            AND form_revision_snapshot IS NULL)
    );

COMMENT ON COLUMN checklist_item_progress.acceptance_criterion_snapshot IS
    'Acceptance criterion copied from the template item on every non-PENDING answer. NULL with criteria_snapshot_at set: the form gave none. Never falls back to the template.';
COMMENT ON COLUMN checklist_item_progress.control_method_snapshot IS
    'Control method copied from the template item on every non-PENDING answer. NULL with criteria_snapshot_at set: the form gave none. Never falls back to the template.';
COMMENT ON COLUMN checklist_item_progress.form_revision_snapshot IS
    'Form revision copied from the template item on every non-PENDING answer. NULL with criteria_snapshot_at set: no revision was recorded. Never falls back to the template.';
COMMENT ON COLUMN checklist_item_progress.criteria_snapshot_at IS
    'When the criterion / method / revision copy was taken. NULL: never copied (PENDING or answered before 0042); such rows show no criterion.';

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
        NEW.approved_desc, NEW.approved_date, NEW.approved_by,
        NEW.acceptance_criterion_snapshot, NEW.control_method_snapshot,
        NEW.form_revision_snapshot, NEW.criteria_snapshot_at
    ) IS NOT DISTINCT FROM (
        OLD.vin, OLD.checklist_type, OLD.check_item_id,
        OLD.check_status, OLD.checker_id, OLD.check_date, OLD.check_image_url,
        OLD.rework_desc, OLD.rework_date, OLD.conditional_desc, OLD.conditional_date,
        OLD.rejected_desc, OLD.rejected_date, OLD.rejected_by,
        OLD.approved_desc, OLD.approved_date, OLD.approved_by,
        OLD.acceptance_criterion_snapshot, OLD.control_method_snapshot,
        OLD.form_revision_snapshot, OLD.criteria_snapshot_at
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
