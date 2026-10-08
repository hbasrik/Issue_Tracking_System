/**
 * Acceptance criterion, control method and form revision of a checklist
 * item, from the printed form (Karar 30). Only filled values are returned:
 * an item without them shows no label, dash or placeholder.
 *
 * Source rule:
 * - 'edit' (open card): the template's current values, which the operator
 *   evaluates against now and which the next save copies.
 * - 'record' (closed card icon, print): answered → the copy taken with the
 *   answer; PENDING → the template; answered without a copy (before the
 *   copy existed) → nothing, never the template.
 */
import type { MessageKey } from './i18n';

export type CriteriaValues = {
  AcceptanceCriterion?: string | null;
  ControlMethod?: string | null;
  FormRevision?: string | null;
};

export type CriteriaItem = CriteriaValues & {
  Status: string;
  AnsweredCriteria?: (CriteriaValues & { CopiedAt?: string }) | null;
};

export type CriteriaContext = 'edit' | 'record';

export type CriteriaLine = {
  kind: 'criterion' | 'method' | 'revision';
  labelKey: MessageKey;
  text: string;
};

export function checklistCriteriaSource(item: CriteriaItem, context: CriteriaContext): CriteriaValues | null {
  if (context === 'edit' || item.Status === 'PENDING') return item;
  return item.AnsweredCriteria ?? null;
}

export function checklistCriteriaLines(
  item: CriteriaItem,
  context: CriteriaContext,
  options: { revision?: boolean } = {},
): CriteriaLine[] {
  const source = checklistCriteriaSource(item, context);
  if (!source) return [];
  const out: CriteriaLine[] = [];
  const criterion = source.AcceptanceCriterion?.trim();
  if (criterion) {
    out.push({ kind: 'criterion', labelKey: 'checklist.acceptanceCriterion', text: criterion });
  }
  const method = source.ControlMethod?.trim();
  if (method) {
    out.push({ kind: 'method', labelKey: 'checklist.controlMethod', text: method });
  }
  const revision = options.revision ? source.FormRevision?.trim() : '';
  if (revision) {
    out.push({ kind: 'revision', labelKey: 'checklist.formRevision', text: revision });
  }
  return out;
}
