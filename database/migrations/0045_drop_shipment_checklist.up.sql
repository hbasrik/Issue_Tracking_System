-- Remove the Shipment checklist from the schema (Karar 33).
--
-- Order of rollout: the application must already run without reading
-- vehicles.shipment_template_id or accepting the SHIPMENT checklist type
-- (commits 5352e0c..49618e8). The old binary reads the column; stop it first.
--
-- Guard: the migration refuses to delete history. It raises, and the whole
-- file rolls back, when any of these exist:
--   * a SHIPMENT progress row that is not PENDING,
--   * an issue raised from a SHIPMENT item (SHIPMENT_ITEM or its item id),
--   * a photo on a SHIPMENT progress row,
--   * an audit row for a SHIPMENT checklist item change.
-- golang-migrate then leaves version 45 dirty; after checking the data run
-- `migrate force 44`. Nothing has been changed at that point.
--
-- With the guard passed it:
--   1. rewrites the five functions without the shipment template; the body
--      of each is its 0044-state body with only the shipment lines removed,
--      and fn_materialize_vehicle_progress loses p_shipment_template_id
--      (new 3-argument function, the 4-argument one is dropped);
--   2. deletes the PENDING SHIPMENT progress rows (no trigger on
--      checklist_item_progress fires on DELETE; vehicles triggers fire only
--      on INSERT and UPDATE OF vehicle_model_id, so no EOL/TEST row is
--      rematerialised);
--   3. drops vehicles.shipment_template_id (and its foreign key);
--   4. deletes every SHIPMENT template (items cascade);
--   5. deletes checklist.shipment.view / .edit (role grants cascade);
--   6. adds CHECK (type <> 'SHIPMENT') on checklist_templates.
-- checklist_type_enum keeps SHIPMENT and issue_source_enum keeps
-- SHIPMENT_ITEM: removing an enum value needs a type rewrite, the CHECK
-- gives the same protection.
--
-- Idempotent: a second run finds nothing to guard or delete.
-- Down (0045_drop_shipment_checklist.down.sql) restores the schema, the
-- functions, an empty SHIPMENT template and the two permissions; deleted
-- items and progress rows are not restored.

DO $$
DECLARE
    v_progress INT;
    v_issues INT;
    v_media INT;
    v_audit INT;
BEGIN
    SELECT count(*) INTO v_progress
    FROM checklist_item_progress p
    WHERE p.check_status::text <> 'PENDING'
      AND (p.checklist_type = 'SHIPMENT'
           OR p.check_item_id IN (
               SELECT i.id FROM checklist_template_items i
               JOIN checklist_templates t ON t.id = i.template_id
               WHERE t.type = 'SHIPMENT'));

    SELECT count(*) INTO v_issues
    FROM issue_list il
    WHERE il.source_type = 'SHIPMENT_ITEM'
       OR il.source_check_item_id IN (
           SELECT i.id FROM checklist_template_items i
           JOIN checklist_templates t ON t.id = i.template_id
           WHERE t.type = 'SHIPMENT');

    SELECT count(*) INTO v_media
    FROM media_attachments m
    JOIN checklist_item_progress p ON p.id::text = m.entity_id
    WHERE m.entity_type = 'CHECKLIST_ITEM_PROGRESS'
      AND p.checklist_type = 'SHIPMENT';

    SELECT count(*) INTO v_audit
    FROM audit_logs a
    WHERE a.event_type = 'CHECKLIST_ITEM_UPDATE'
      AND a.metadata ->> 'checklist_type' = 'SHIPMENT';

    IF v_progress + v_issues + v_media + v_audit > 0 THEN
        RAISE EXCEPTION
            '0045: Shipment checklist has history, nothing deleted (non-PENDING progress rows: %, issues: %, photos: %, audit rows: %)',
            v_progress, v_issues, v_media, v_audit;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION fn_materialize_vehicle_progress(
    p_vin VARCHAR,
    p_eol_template_id INT,
    p_test_template_id INT
)
RETURNS VOID AS $function$
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
    SELECT p_vin, 'TEST', cti.id, 'PENDING'
    FROM checklist_template_items cti
    WHERE cti.template_id = p_test_template_id AND cti.is_active = TRUE
    ON CONFLICT (vin, check_item_id) DO NOTHING;

    INSERT INTO vehicle_eol_workflow (vin, current_stage)
    VALUES (p_vin, 'BRANCH')
    ON CONFLICT (vin) DO NOTHING;
END;
$function$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_initialize_vehicle_progress()
RETURNS TRIGGER AS $function$
BEGIN
    PERFORM fn_materialize_vehicle_progress(
        NEW.vin,
        NEW.eol_template_id,
        NEW.test_template_id
    );
    RETURN NEW;
END;
$function$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_rematerialize_checklist_after_template_reassign()
RETURNS TRIGGER AS $function$
BEGIN
    IF NEW.eol_template_id IS NOT DISTINCT FROM OLD.eol_template_id
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
        NEW.test_template_id
    );
    RETURN NEW;
END;
$function$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_assign_checklist_templates()
RETURNS TRIGGER AS $function$
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
$function$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_reassign_checklist_templates_on_model_change()
RETURNS TRIGGER AS $function$
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
$function$ LANGUAGE plpgsql;

DROP FUNCTION IF EXISTS fn_materialize_vehicle_progress(VARCHAR, INT, INT, INT);

DO $$
DECLARE
    v_rows BIGINT;
BEGIN
    DELETE FROM checklist_item_progress p
    WHERE p.checklist_type = 'SHIPMENT'
       OR p.check_item_id IN (
           SELECT i.id FROM checklist_template_items i
           JOIN checklist_templates t ON t.id = i.template_id
           WHERE t.type = 'SHIPMENT');
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RAISE NOTICE '0045: deleted % SHIPMENT progress row(s)', v_rows;
END;
$$;

ALTER TABLE vehicles DROP COLUMN IF EXISTS shipment_template_id;

DO $$
DECLARE
    v_items BIGINT;
    v_templates BIGINT;
BEGIN
    SELECT count(*) INTO v_items
    FROM checklist_template_items i
    JOIN checklist_templates t ON t.id = i.template_id
    WHERE t.type = 'SHIPMENT';
    DELETE FROM checklist_templates WHERE type = 'SHIPMENT';
    GET DIAGNOSTICS v_templates = ROW_COUNT;
    RAISE NOTICE '0045: deleted % SHIPMENT template(s) with % item(s)', v_templates, v_items;
END;
$$;

DO $$
DECLARE
    v_grants BIGINT;
    v_permissions BIGINT;
BEGIN
    SELECT count(*) INTO v_grants
    FROM role_permissions rp
    JOIN permissions p ON p.id = rp.permission_id
    WHERE p.code IN ('checklist.shipment.view', 'checklist.shipment.edit');
    DELETE FROM permissions
    WHERE code IN ('checklist.shipment.view', 'checklist.shipment.edit');
    GET DIAGNOSTICS v_permissions = ROW_COUNT;
    RAISE NOTICE '0045: deleted % permission(s) with % role grant(s)', v_permissions, v_grants;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'checklist_templates'::regclass
          AND conname = 'checklist_templates_type_not_shipment'
    ) THEN
        ALTER TABLE checklist_templates
            ADD CONSTRAINT checklist_templates_type_not_shipment
            CHECK (type <> 'SHIPMENT');
    END IF;
END;
$$;
