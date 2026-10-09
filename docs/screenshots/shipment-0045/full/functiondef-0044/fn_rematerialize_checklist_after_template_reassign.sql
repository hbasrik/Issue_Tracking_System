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
$function$

