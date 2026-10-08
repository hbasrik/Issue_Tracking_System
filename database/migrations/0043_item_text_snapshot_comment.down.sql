-- Reverts 0043: restores the 0020 comment verbatim. Idempotent.

COMMENT ON COLUMN checklist_item_progress.item_text_snapshot IS
    'Item text frozen at first non-PENDING evaluation. NULL for PENDING and legacy rows; UI falls back to checklist_template_items.item_text.';
