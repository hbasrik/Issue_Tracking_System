DROP TRIGGER IF EXISTS trg_enforce_checklist_media_frozen ON media_attachments;
DROP FUNCTION IF EXISTS fn_enforce_checklist_media_frozen();
DROP FUNCTION IF EXISTS fn_checklist_media_frozen_reason(VARCHAR, TEXT);

DROP TRIGGER IF EXISTS trg_enforce_checklist_frozen ON checklist_item_progress;
DROP FUNCTION IF EXISTS fn_enforce_checklist_frozen();
DROP FUNCTION IF EXISTS fn_checklist_item_frozen_reason(VARCHAR, checklist_type_enum, INTEGER);
