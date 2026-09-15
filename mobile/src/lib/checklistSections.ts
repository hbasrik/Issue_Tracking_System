import type { MessageKey } from '../../../shared/i18n';
import type { ChecklistItem } from '../api/client';

export type ChecklistSectionDef = {
  titleKey: MessageKey;
  from: number;
  to: number;
};

/**
 * Group checklist items into titled ranges. Any ItemNo outside every range
 * (e.g. catalogue items added after the section map was written) lands in a
 * catch-all "additional" group — never silently dropped.
 */
export function groupChecklistSections(
  items: ChecklistItem[],
  sections: ChecklistSectionDef[],
  additionalTitleKey: MessageKey = 'checklist.section.additional',
): { titleKey: MessageKey; items: ChecklistItem[] }[] {
  const grouped = sections.map((sec) => ({
    titleKey: sec.titleKey,
    items: items.filter((i) => i.ItemNo >= sec.from && i.ItemNo <= sec.to),
  }));

  const covered = new Set(
    grouped.flatMap((g) => g.items.map((i) => i.ItemID)),
  );
  const overflow = items
    .filter((i) => !covered.has(i.ItemID))
    .slice()
    .sort((a, b) => a.ItemNo - b.ItemNo);

  if (overflow.length > 0) {
    grouped.push({ titleKey: additionalTitleKey, items: overflow });
  }

  return grouped.filter((g) => g.items.length > 0);
}
