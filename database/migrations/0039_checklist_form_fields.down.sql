-- Drops only the five form columns added by 0039. Any values entered into
-- them are lost; nothing else changes. IF EXISTS keeps the file idempotent.

ALTER TABLE checklist_templates
    DROP COLUMN IF EXISTS form_published_at,
    DROP COLUMN IF EXISTS form_revision,
    DROP COLUMN IF EXISTS form_code;

ALTER TABLE checklist_template_items
    DROP COLUMN IF EXISTS control_method,
    DROP COLUMN IF EXISTS acceptance_criterion;
