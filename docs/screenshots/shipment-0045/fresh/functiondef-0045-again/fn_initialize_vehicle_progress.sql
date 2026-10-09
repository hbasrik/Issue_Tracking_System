CREATE OR REPLACE FUNCTION public.fn_initialize_vehicle_progress()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    PERFORM fn_materialize_vehicle_progress(
        NEW.vin,
        NEW.eol_template_id,
        NEW.test_template_id
    );
    RETURN NEW;
END;
$function$

