CREATE OR REPLACE FUNCTION public.fn_reassign_checklist_templates_on_model_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_has_evaluated BOOLEAN;
    v_eol_template_id INT;
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

    SELECT id INTO v_test_template_id
    FROM checklist_templates
    WHERE type = 'TEST' AND is_active = TRUE
      AND (vehicle_model_id IS NOT DISTINCT FROM NEW.vehicle_model_id
           OR vehicle_model_id IS NULL)
    ORDER BY vehicle_model_id NULLS LAST, id
    LIMIT 1;

    NEW.eol_template_id := v_eol_template_id;
    NEW.test_template_id := v_test_template_id;
    RETURN NEW;
END;
$function$

