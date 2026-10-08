/**
 * Acceptance criterion and control method of a checklist item, from the
 * printed form (Karar 30). Only filled values are returned: an item without
 * them shows no label, dash or placeholder.
 */
import type { MessageKey } from './i18n';

export type CriteriaItem = {
  AcceptanceCriterion?: string | null;
  ControlMethod?: string | null;
};

export type CriteriaLine = {
  kind: 'criterion' | 'method';
  labelKey: MessageKey;
  text: string;
};

export function checklistCriteriaLines(item: CriteriaItem): CriteriaLine[] {
  const out: CriteriaLine[] = [];
  const criterion = item.AcceptanceCriterion?.trim();
  if (criterion) {
    out.push({ kind: 'criterion', labelKey: 'checklist.acceptanceCriterion', text: criterion });
  }
  const method = item.ControlMethod?.trim();
  if (method) {
    out.push({ kind: 'method', labelKey: 'checklist.controlMethod', text: method });
  }
  return out;
}
