-- 0043: correct the item_text_snapshot column comment (docs/11 Karar 30).
--
-- 0020 described the copy as frozen at the first non-PENDING evaluation.
-- Since the answer-copy change SaveResult re-copies the item text on every
-- non-PENDING answer, so the old comment misleads. Comment only: no column,
-- row, constraint or function changes. Idempotent; no downtime.

COMMENT ON COLUMN checklist_item_progress.item_text_snapshot IS
    'Item text copied from the template item on every non-PENDING answer; PENDING keeps the last copy. NULL for never-answered and legacy rows; UI falls back to checklist_template_items.item_text.';
