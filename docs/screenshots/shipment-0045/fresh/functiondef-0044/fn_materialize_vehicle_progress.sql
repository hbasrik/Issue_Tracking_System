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
$function$

