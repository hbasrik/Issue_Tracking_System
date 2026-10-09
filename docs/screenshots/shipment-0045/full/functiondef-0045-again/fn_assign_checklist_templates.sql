CREATE OR REPLACE FUNCTION public.fn_assign_checklist_templates()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_eol_template_id INT;
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

    SELECT id INTO v_test_template_id
    FROM checklist_templates
    WHERE type = 'TEST' AND is_active = TRUE
      AND (vehicle_model_id IS NOT DISTINCT FROM NEW.vehicle_model_id
           OR vehicle_model_id IS NULL)
    ORDER BY vehicle_model_id NULLS LAST, id
    LIMIT 1;

    SELECT id INTO v_first_station_id FROM stations WHERE is_active = TRUE ORDER BY sequence_no LIMIT 1;

    NEW.eol_template_id := v_eol_template_id;
    NEW.test_template_id := v_test_template_id;
    IF NEW.current_global_status::text IS DISTINCT FROM 'PLANNED' THEN
        NEW.current_station_id := v_first_station_id;
    END IF;
    RETURN NEW;
END;
$function$

