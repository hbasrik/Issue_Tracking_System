-- Depot-after-branch sequencing (0004) ignores branch rows whose stage is
-- closed: the vehicle already shipped from the branch (or is delivered) and
-- the row was never evaluated, or the vehicle is delivered and the row is not
-- passing. Such rows can no longer be completed, so they must not lock depot
-- edits (docs/11 Karar 15, backend stage_applicability.go). Evaluated NOT_OK /
-- REWORK branch rows after branch ship still block, as before.
--
-- Function body only; no row is changed.

CREATE OR REPLACE FUNCTION fn_enforce_eol_depot_after_branch()
RETURNS TRIGGER AS $$
DECLARE
    v_phase eol_item_phase_enum;
    v_branch_incomplete BOOLEAN;
BEGIN
    IF NEW.checklist_type <> 'EOL' THEN
        RETURN NEW;
    END IF;

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
        JOIN vehicles v ON v.vin = p.vin
        LEFT JOIN vehicle_eol_workflow w ON w.vin = p.vin
        WHERE p.vin = NEW.vin
          AND p.checklist_type = 'EOL'
          AND cti.eol_phase = 'BRANCH'
          AND p.check_status NOT IN ('OK', 'CONDITIONAL_OK')
          AND NOT (
                (v.current_global_status IN ('DELIVERED', 'SHIPPED')
                 OR w.branch_shipped_at IS NOT NULL)
            AND (p.check_status = 'PENDING'
                 OR v.current_global_status IN ('DELIVERED', 'SHIPPED'))
          )
    ) INTO v_branch_incomplete;

    IF v_branch_incomplete THEN
        RAISE EXCEPTION 'cannot update depot-phase EoL items until every branch-phase item is OK or CONDITIONAL_OK';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
