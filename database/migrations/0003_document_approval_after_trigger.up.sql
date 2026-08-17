-- fn_enforce_document_approval used to run BEFORE UPDATE and immediately
-- SET vehicles.current_global_status = 'SHIPPED'. That UPDATE fires
-- trg_enforce_manual_status_change, which looks up vehicle_eol_workflow
-- for a non-null document_approved_at. In a BEFORE trigger the new value
-- is not visible yet, so every document-approve (API or seed) raised
-- "EOL document phase is not approved".
--
-- Move the work to AFTER UPDATE so the SHIPPED gate sees the row that
-- was just written. current_stage cannot be assigned on NEW in an AFTER
-- trigger, so it is written with a follow-up UPDATE that does not touch
-- document_approved_at (this trigger is UPDATE OF that column only).

DROP TRIGGER IF EXISTS trg_enforce_document_approval ON vehicle_eol_workflow;

CREATE OR REPLACE FUNCTION fn_enforce_document_approval()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.document_approved_at IS NOT NULL AND OLD.document_approved_at IS NULL THEN
        UPDATE vehicle_eol_workflow
        SET current_stage = 'COMPLETED'
        WHERE vin = NEW.vin
          AND current_stage IS DISTINCT FROM 'COMPLETED';

        UPDATE vehicles SET current_global_status = 'SHIPPED' WHERE vin = NEW.vin;

        INSERT INTO audit_logs (vin, event_type, old_value, new_value, performed_by, metadata)
        VALUES (NEW.vin, 'EOL_WORKFLOW_STAGE_CHANGE', 'DOCUMENT', 'COMPLETED', NEW.document_approved_by, '{}'::jsonb);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_document_approval
    AFTER UPDATE OF document_approved_at ON vehicle_eol_workflow
    FOR EACH ROW EXECUTE FUNCTION fn_enforce_document_approval();
