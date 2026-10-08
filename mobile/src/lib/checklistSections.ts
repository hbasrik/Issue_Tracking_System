/**
 * Mobile checklist section grouping — data-driven via SectionKey.
 * Range-based maps were removed; see shared/checklistSections.ts.
 */
import type { Translate } from '../../../shared/i18n';
import { groupItemsBySectionKey } from '../../../shared/checklistSections';
import type { ChecklistItem } from '../api/client';

export function groupChecklistSections(
  items: ChecklistItem[],
  t: Translate,
): { key: string; title: string; items: ChecklistItem[] }[] {
  return groupItemsBySectionKey(items, t).map((g) => ({
    key: g.sectionKey ?? '__other',
    title: g.title,
    items: g.items,
  }));
}
