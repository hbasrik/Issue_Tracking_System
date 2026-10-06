-- Form fields from the new quality forms (docs/21).
--
--   checklist_template_items.acceptance_criterion  "Kabul kriteri" — fixed
--                                                   text per item, not an answer
--   checklist_template_items.control_method        "Kontrol yöntemi" — fixed text
--   checklist_templates.form_code                  "Form no" of the printed form
--   checklist_templates.form_revision              revision of that form
--   checklist_templates.form_published_at          publication date of that form
--
-- All five are nullable with no default: existing rows are not updated and
-- stay NULL. IF NOT EXISTS keeps the file idempotent.

ALTER TABLE checklist_template_items
    ADD COLUMN IF NOT EXISTS acceptance_criterion TEXT NULL,
    ADD COLUMN IF NOT EXISTS control_method       TEXT NULL;

ALTER TABLE checklist_templates
    ADD COLUMN IF NOT EXISTS form_code         TEXT NULL,
    ADD COLUMN IF NOT EXISTS form_revision     TEXT NULL,
    ADD COLUMN IF NOT EXISTS form_published_at DATE NULL;
