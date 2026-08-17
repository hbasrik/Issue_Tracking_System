-- Restore the v2 BEFORE UPDATE document-approval trigger.

DROP TRIGGER IF EXISTS trg_enforce_document_approval ON vehicle_eol_workflow;

CREATE OR REPLACE FUNCTION fn_enforce_document_approval()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.document_approved_at IS NOT NULL AND OLD.document_approved_at IS NULL THEN
        NEW.current_stage := 'COMPLETED';

        UPDATE vehicles SET current_global_status = 'SHIPPED' WHERE vin = NEW.vin;

        INSERT INTO audit_logs (vin, event_type, old_value, new_value, performed_by, metadata)
        VALUES (NEW.vin, 'EOL_WORKFLOW_STAGE_CHANGE', 'DOCUMENT', 'COMPLETED', NEW.document_approved_by, '{}'::jsonb);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_document_approval
    BEFORE UPDATE OF document_approved_at ON vehicle_eol_workflow
    FOR EACH ROW EXECUTE FUNCTION fn_enforce_document_approval();
