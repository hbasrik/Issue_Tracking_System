-- Depot-phase EoL items must wait until every Branch-phase EoL item for
-- the same VIN is OK or CONDITIONAL_OK. This is item-completion order,
-- independent of Ship-to-Depot (open-issue warning) and Depot-Release
-- (open-issue hard block).
--
-- PENDING inserts are allowed so vehicle initialization can materialize
-- Depot rows while Branch items are still PENDING. Any later non-PENDING
-- write is rejected until Branch is complete.
--
-- The description CHECK is scoped to EOL only: Test and Shipment items
-- are plain Yes/No and do not require a note.

ALTER TABLE checklist_item_progress
    DROP CONSTRAINT IF EXISTS chk_description_required_by_status;

ALTER TABLE checklist_item_progress
    ADD CONSTRAINT chk_description_required_by_status CHECK (
        checklist_type <> 'EOL'
        OR check_status IN ('PENDING', 'OK')
        OR (check_status = 'NOT_OK' AND rejected_desc IS NOT NULL)
        OR (check_status = 'REWORK' AND rework_desc IS NOT NULL)
        OR (check_status = 'CONDITIONAL_OK' AND conditional_desc IS NOT NULL)
    );

CREATE OR REPLACE FUNCTION fn_enforce_eol_depot_after_branch()
RETURNS TRIGGER AS $$
DECLARE
    v_phase eol_item_phase_enum;
    v_branch_incomplete BOOLEAN;
BEGIN
    IF NEW.checklist_type <> 'EOL' THEN
        RETURN NEW;
    END IF;

    -- Vehicle-init copies Depot items as PENDING while Branch is also
    -- PENDING; that INSERT must succeed. Operator evaluations are the
    -- non-PENDING writes this gate is for.
    IF TG_OP = 'INSERT' AND NEW.check_status = 'PENDING' THEN
        RETURN NEW;
    END IF;

    SELECT eol_phase INTO v_phase
    FROM checklist_template_items
    WHERE id = NEW.check_item_id;

    IF v_phase IS DISTINCT FROM 'DEPOT' THEN
        RETURN NEW;
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM checklist_item_progress p
        JOIN checklist_template_items cti ON cti.id = p.check_item_id
        WHERE p.vin = NEW.vin
          AND p.checklist_type = 'EOL'
          AND cti.eol_phase = 'BRANCH'
          AND p.check_status NOT IN ('OK', 'CONDITIONAL_OK')
    ) INTO v_branch_incomplete;

    IF v_branch_incomplete THEN
        RAISE EXCEPTION 'cannot update depot-phase EoL items until every branch-phase item is OK or CONDITIONAL_OK';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_eol_depot_after_branch ON checklist_item_progress;

CREATE TRIGGER trg_enforce_eol_depot_after_branch
    BEFORE INSERT OR UPDATE OF check_status ON checklist_item_progress
    FOR EACH ROW EXECUTE FUNCTION fn_enforce_eol_depot_after_branch();
