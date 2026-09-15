-- Model-aware checklist template guarantees (flexibility audit P0#4).
-- 1) At most one ACTIVE template per (type, model) and per (type, generic NULL).
-- 2) On vehicles.vehicle_model_id change: re-resolve template FKs only when the
--    vehicle has no evaluated checklist progress (all PENDING or none). Evaluated
--    history must not be rewritten onto a different catalogue.
-- Idempotent: CREATE INDEX IF NOT EXISTS; CREATE OR REPLACE FUNCTION.

-- Active model-specific: one row per (type, vehicle_model_id).
CREATE UNIQUE INDEX IF NOT EXISTS uq_checklist_templates_active_type_model
    ON checklist_templates (type, vehicle_model_id)
    WHERE is_active AND vehicle_model_id IS NOT NULL;

-- Active generic (NULL model): one row per type.
CREATE UNIQUE INDEX IF NOT EXISTS uq_checklist_templates_active_type_generic
    ON checklist_templates (type)
    WHERE is_active AND vehicle_model_id IS NULL;

COMMENT ON INDEX uq_checklist_templates_active_type_model IS
    'At most one active model-specific checklist template per type+model.';
COMMENT ON INDEX uq_checklist_templates_active_type_generic IS
    'At most one active generic (vehicle_model_id NULL) checklist template per type.';

-- Keep INSERT assign in sync: prefer model-specific, else generic.
CREATE OR REPLACE FUNCTION fn_assign_checklist_templates()
RETURNS TRIGGER AS $$
DECLARE
    v_eol_template_id INT;
    v_shipment_template_id INT;
    v_test_template_id INT;
    v_first_station_id INT;
BEGIN
    SELECT id INTO v_eol_template_id
    FROM checklist_templates
    WHERE type = 'EOL' AND is_active = TRUE
      AND (vehicle_model_id IS NOT DISTINCT FROM NEW.vehicle_model_id
           OR vehicle_model_id IS NULL)
    ORDER BY vehicle_model_id NULLS LAST, id
    LIMIT 1;

    SELECT id INTO v_shipment_template_id
    FROM checklist_templates
    WHERE type = 'SHIPMENT' AND is_active = TRUE
      AND (vehicle_model_id IS NOT DISTINCT FROM NEW.vehicle_model_id
           OR vehicle_model_id IS NULL)
    ORDER BY vehicle_model_id NULLS LAST, id
    LIMIT 1;

    SELECT id INTO v_test_template_id
    FROM checklist_templates
    WHERE type = 'TEST' AND is_active = TRUE
      AND (vehicle_model_id IS NOT DISTINCT FROM NEW.vehicle_model_id
           OR vehicle_model_id IS NULL)
    ORDER BY vehicle_model_id NULLS LAST, id
    LIMIT 1;

    SELECT id INTO v_first_station_id FROM stations WHERE is_active = TRUE ORDER BY sequence_no LIMIT 1;

    NEW.eol_template_id := v_eol_template_id;
    NEW.shipment_template_id := v_shipment_template_id;
    NEW.test_template_id := v_test_template_id;
    IF NEW.current_global_status::text IS DISTINCT FROM 'PLANNED' THEN
        NEW.current_station_id := v_first_station_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Re-resolve template FKs when model is assigned/changed, only if checklist
-- work has not started (no non-PENDING checklist_item_progress rows).
CREATE OR REPLACE FUNCTION fn_reassign_checklist_templates_on_model_change()
RETURNS TRIGGER AS $$
DECLARE
    v_has_evaluated BOOLEAN;
    v_eol_template_id INT;
    v_shipment_template_id INT;
    v_test_template_id INT;
BEGIN
    IF NEW.vehicle_model_id IS NOT DISTINCT FROM OLD.vehicle_model_id THEN
        RETURN NEW;
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM checklist_item_progress
        WHERE vin = NEW.vin
          AND check_status::text IS DISTINCT FROM 'PENDING'
    ) INTO v_has_evaluated;

    IF v_has_evaluated THEN
        -- Preserve bindings so evaluated history stays on the original catalogue.
        RETURN NEW;
    END IF;

    SELECT id INTO v_eol_template_id
    FROM checklist_templates
    WHERE type = 'EOL' AND is_active = TRUE
      AND (vehicle_model_id IS NOT DISTINCT FROM NEW.vehicle_model_id
           OR vehicle_model_id IS NULL)
    ORDER BY vehicle_model_id NULLS LAST, id
    LIMIT 1;

    SELECT id INTO v_shipment_template_id
    FROM checklist_templates
    WHERE type = 'SHIPMENT' AND is_active = TRUE
      AND (vehicle_model_id IS NOT DISTINCT FROM NEW.vehicle_model_id
           OR vehicle_model_id IS NULL)
    ORDER BY vehicle_model_id NULLS LAST, id
    LIMIT 1;

    SELECT id INTO v_test_template_id
    FROM checklist_templates
    WHERE type = 'TEST' AND is_active = TRUE
      AND (vehicle_model_id IS NOT DISTINCT FROM NEW.vehicle_model_id
           OR vehicle_model_id IS NULL)
    ORDER BY vehicle_model_id NULLS LAST, id
    LIMIT 1;

    NEW.eol_template_id := v_eol_template_id;
    NEW.shipment_template_id := v_shipment_template_id;
    NEW.test_template_id := v_test_template_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reassign_checklist_templates_on_model_change ON vehicles;
CREATE TRIGGER trg_reassign_checklist_templates_on_model_change
    BEFORE UPDATE OF vehicle_model_id ON vehicles
    FOR EACH ROW
    EXECUTE FUNCTION fn_reassign_checklist_templates_on_model_change();

-- When template FKs actually change for a not-started vehicle, drop PENDING
-- checklist rows and rematerialize against the new catalogues.
CREATE OR REPLACE FUNCTION fn_rematerialize_checklist_after_template_reassign()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.eol_template_id IS NOT DISTINCT FROM OLD.eol_template_id
       AND NEW.shipment_template_id IS NOT DISTINCT FROM OLD.shipment_template_id
       AND NEW.test_template_id IS NOT DISTINCT FROM OLD.test_template_id THEN
        RETURN NEW;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM checklist_item_progress
        WHERE vin = NEW.vin
          AND check_status::text IS DISTINCT FROM 'PENDING'
    ) THEN
        RETURN NEW;
    END IF;

    DELETE FROM checklist_item_progress
    WHERE vin = NEW.vin
      AND check_status = 'PENDING';

    PERFORM fn_materialize_vehicle_progress(
        NEW.vin,
        NEW.eol_template_id,
        NEW.shipment_template_id,
        NEW.test_template_id
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_rematerialize_checklist_after_template_reassign ON vehicles;
CREATE TRIGGER trg_rematerialize_checklist_after_template_reassign
    AFTER UPDATE OF vehicle_model_id ON vehicles
    FOR EACH ROW
    EXECUTE FUNCTION fn_rematerialize_checklist_after_template_reassign();
