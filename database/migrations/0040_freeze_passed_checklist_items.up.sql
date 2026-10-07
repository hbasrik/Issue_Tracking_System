-- Freeze checklist items once their stage is behind the vehicle
-- (docs/11 Karar 29). The stage rule is the one in
-- backend/internal/repository/postgres/stage_applicability.go:
--   * delivered vehicle (DELIVERED, legacy SHIPPED): every item is frozen;
--   * EOL DEPOT item: frozen once vehicle_eol_workflow.depot_released_at is
--     set;
--   * every other item (EOL BRANCH, TEST, SHIPMENT): frozen once
--     vehicle_eol_workflow.branch_shipped_at is set.
-- Both gates are hard in the application and in their triggers
-- (fn_enforce_branch_shipment, fn_enforce_depot_release), so an item can only
-- freeze after it passed. EOL reset clears the stamps and thereby unfreezes.
--
-- Frozen means: the answer cannot change and no photo can be added. Existing
-- photos stay readable. The application refuses the same writes first (409);
-- these triggers also stop direct SQL. The messages equal the domain errors
-- so the API maps them back to the same 409.
--
-- Not frozen, so existing flows keep working:
--   * INSERT of a PENDING row (materialisation, template propagation);
--   * UPDATE that leaves the row identity and every answer column unchanged
--     (issue link sets related_issue_id, updated_at, item_text_snapshot);
--   * DELETE (unchanged; only PENDING rows are ever deleted, and vehicle
--     delete cascades).
--
-- New functions and triggers only; no row is changed. Separate from
-- trg_enforce_eol_depot_after_branch (0004/0031), which keeps its rule.

-- Why the item behind (vin, type, item) is frozen, or NULL when it is not.
CREATE OR REPLACE FUNCTION fn_checklist_item_frozen_reason(
    p_vin VARCHAR,
    p_type checklist_type_enum,
    p_item_id INTEGER
) RETURNS TEXT AS $$
DECLARE
    v_status TEXT;
    v_branch_shipped BOOLEAN;
    v_depot_released BOOLEAN;
    v_phase TEXT;
BEGIN
    SELECT v.current_global_status::text,
           w.branch_shipped_at IS NOT NULL,
           w.depot_released_at IS NOT NULL
      INTO v_status, v_branch_shipped, v_depot_released
    FROM vehicles v
    LEFT JOIN vehicle_eol_workflow w ON w.vin = v.vin
    WHERE v.vin = p_vin;

    IF v_status IN ('DELIVERED', 'SHIPPED') THEN
        RETURN 'cannot change checklist items of a delivered vehicle';
    END IF;

    IF p_type = 'EOL' THEN
        SELECT eol_phase::text INTO v_phase
        FROM checklist_template_items
        WHERE id = p_item_id;
    END IF;

    IF p_type = 'EOL' AND v_phase = 'DEPOT' THEN
        IF COALESCE(v_depot_released, FALSE) THEN
            RETURN 'cannot change depot-stage EoL items after the vehicle has been released from the depot';
        END IF;
    ELSIF COALESCE(v_branch_shipped, FALSE) THEN
        RETURN 'cannot change branch-stage checklist items after the vehicle has shipped from the branch';
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

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

DROP TRIGGER IF EXISTS trg_enforce_checklist_frozen ON checklist_item_progress;

CREATE TRIGGER trg_enforce_checklist_frozen
    BEFORE INSERT OR UPDATE ON checklist_item_progress
    FOR EACH ROW EXECUTE FUNCTION fn_enforce_checklist_frozen();

-- Reason for a CHECKLIST_ITEM_PROGRESS attachment pointing at entity_id, or
-- NULL. A non-numeric or unknown id is left to the application (400/404).
CREATE OR REPLACE FUNCTION fn_checklist_media_frozen_reason(
    p_entity_type VARCHAR,
    p_entity_id TEXT
) RETURNS TEXT AS $$
DECLARE
    v_row checklist_item_progress%ROWTYPE;
BEGIN
    IF p_entity_type IS DISTINCT FROM 'CHECKLIST_ITEM_PROGRESS'
       OR p_entity_id !~ '^[0-9]{1,18}$' THEN
        RETURN NULL;
    END IF;

    SELECT * INTO v_row FROM checklist_item_progress WHERE id = p_entity_id::bigint;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    RETURN fn_checklist_item_frozen_reason(v_row.vin, v_row.checklist_type, v_row.check_item_id);
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION fn_enforce_checklist_media_frozen()
RETURNS TRIGGER AS $$
DECLARE
    v_reason TEXT;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW IS NOT DISTINCT FROM OLD THEN
            RETURN NEW;
        END IF;
        v_reason := fn_checklist_media_frozen_reason(OLD.entity_type, OLD.entity_id);
        IF v_reason IS NOT NULL THEN
            RAISE EXCEPTION '%', v_reason;
        END IF;
    END IF;

    v_reason := fn_checklist_media_frozen_reason(NEW.entity_type, NEW.entity_id);
    IF v_reason IS NOT NULL THEN
        RAISE EXCEPTION '%', v_reason;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_checklist_media_frozen ON media_attachments;

CREATE TRIGGER trg_enforce_checklist_media_frozen
    BEFORE INSERT OR UPDATE ON media_attachments
    FOR EACH ROW EXECUTE FUNCTION fn_enforce_checklist_media_frozen();
