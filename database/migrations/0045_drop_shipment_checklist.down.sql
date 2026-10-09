-- Roll back 0045 (Karar 33): the schema and functions return to their
-- 0044 state. What comes back:
--   * CHECK checklist_templates_type_not_shipment is dropped;
--   * vehicles.shipment_template_id (FK to checklist_templates) is added,
--     NULL on every existing vehicle: no UPDATE runs, so no vehicle trigger
--     fires; new vehicles get the template from fn_assign_checklist_templates;
--   * one empty, active SHIPMENT template (vehicle_model_id NULL, the 0044
--     name "Default Customer Vehicle Checklist");
--   * checklist.shipment.view / .edit with the 0010 grants (OPERATOR,
--     MANAGER_ADMIN, ASSEMBLY);
--   * the five functions, each body copied from pg_get_functiondef on a
--     0044 database, so their definitions match 0044 byte for byte.
-- What does not come back: the deleted template items and progress rows,
-- and the original template / permission ids.
-- Idempotent: every step checks before it writes.

ALTER TABLE checklist_templates
    DROP CONSTRAINT IF EXISTS checklist_templates_type_not_shipment;

ALTER TABLE vehicles
    ADD COLUMN IF NOT EXISTS shipment_template_id INT REFERENCES checklist_templates(id);

INSERT INTO checklist_templates (vehicle_model_id, type, name, is_active)
SELECT NULL, 'SHIPMENT', 'Default Customer Vehicle Checklist', TRUE
WHERE NOT EXISTS (SELECT 1 FROM checklist_templates WHERE type = 'SHIPMENT');

INSERT INTO permissions (code, description) VALUES
    ('checklist.shipment.view', 'View the Shipment checklist'),
    ('checklist.shipment.edit', 'Update Shipment checklist items')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN ('checklist.shipment.view', 'checklist.shipment.edit')
WHERE r.code IN ('OPERATOR', 'MANAGER_ADMIN', 'ASSEMBLY')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.fn_materialize_vehicle_progress(p_vin character varying, p_eol_template_id integer, p_shipment_template_id integer, p_test_template_id integer)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
    INSERT INTO vehicle_station_step_progress (vin, station_id, station_step_id, status)
    SELECT p_vin, ss.station_id, ss.id, 'PENDING'
    FROM station_steps ss
    WHERE ss.is_active = TRUE
    ON CONFLICT (vin, station_step_id) DO NOTHING;

    INSERT INTO checklist_item_progress (vin, checklist_type, check_item_id, check_status)
    SELECT p_vin, 'EOL', cti.id, 'PENDING'
    FROM checklist_template_items cti
    WHERE cti.template_id = p_eol_template_id AND cti.is_active = TRUE
    ON CONFLICT (vin, check_item_id) DO NOTHING;

    INSERT INTO checklist_item_progress (vin, checklist_type, check_item_id, check_status)
    SELECT p_vin, 'SHIPMENT', cti.id, 'PENDING'
    FROM checklist_template_items cti
    WHERE cti.template_id = p_shipment_template_id AND cti.is_active = TRUE
    ON CONFLICT (vin, check_item_id) DO NOTHING;

    INSERT INTO checklist_item_progress (vin, checklist_type, check_item_id, check_status)
    SELECT p_vin, 'TEST', cti.id, 'PENDING'
    FROM checklist_template_items cti
    WHERE cti.template_id = p_test_template_id AND cti.is_active = TRUE
    ON CONFLICT (vin, check_item_id) DO NOTHING;

    INSERT INTO vehicle_eol_workflow (vin, current_stage)
    VALUES (p_vin, 'BRANCH')
    ON CONFLICT (vin) DO NOTHING;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_initialize_vehicle_progress()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    PERFORM fn_materialize_vehicle_progress(
        NEW.vin,
        NEW.eol_template_id,
        NEW.shipment_template_id,
        NEW.test_template_id
    );
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_rematerialize_checklist_after_template_reassign()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.fn_assign_checklist_templates()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.fn_reassign_checklist_templates_on_model_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
$function$;

DROP FUNCTION IF EXISTS fn_materialize_vehicle_progress(VARCHAR, INT, INT);
