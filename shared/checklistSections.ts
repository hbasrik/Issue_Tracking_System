/**
 * Checklist section catalog + grouping by section_key (not ItemNo ranges).
 *
 * Why a column on the item (not a sections table): sections are lightweight
 * display labels per checklist type, already mirrored in i18n keys
 * (checklist.section.*). A free-standing table would add joins/admin CRUD
 * without buying integrity we need; section_key + section_sort keep reorder
 * (item_no) independent of grouping.
 */

import type { MessageKey, Translate } from './i18n';

export type ChecklistSectionCatalogEntry = {
  key: string;
  sort: number;
  titleKey: MessageKey;
};

/** Known Test checklist sections (historical mobile ranges 1-45). */
export const TEST_CHECKLIST_SECTIONS: ChecklistSectionCatalogEntry[] = [
  { key: 'brakes', sort: 10, titleKey: 'checklist.section.brakes' },
  { key: 'steering', sort: 20, titleKey: 'checklist.section.steering' },
  { key: 'lights', sort: 30, titleKey: 'checklist.section.lights' },
  { key: 'diag', sort: 40, titleKey: 'checklist.section.diag' },
  { key: 'hv', sort: 50, titleKey: 'checklist.section.hv' },
  { key: 'drive', sort: 60, titleKey: 'checklist.section.drive' },
  { key: 'dash', sort: 70, titleKey: 'checklist.section.dash' },
  { key: 'body', sort: 80, titleKey: 'checklist.section.body' },
  { key: 'adas', sort: 90, titleKey: 'checklist.section.adas' },
  { key: 'infotainment', sort: 100, titleKey: 'checklist.section.infotainment' },
  { key: 'final', sort: 110, titleKey: 'checklist.section.final' },
];

/** Known Shipment checklist sections (historical mobile ranges 1-43). */
export const SHIPMENT_CHECKLIST_SECTIONS: ChecklistSectionCatalogEntry[] = [
  { key: 'identity', sort: 10, titleKey: 'checklist.section.identity' },
  { key: 'exterior', sort: 20, titleKey: 'checklist.section.exterior' },
  { key: 'locks', sort: 30, titleKey: 'checklist.section.locks' },
  { key: 'lighting', sort: 40, titleKey: 'checklist.section.lighting' },
  { key: 'interior', sort: 50, titleKey: 'checklist.section.interior' },
  { key: 'charge', sort: 60, titleKey: 'checklist.section.charge' },
];

const KNOWN_TITLE: Record<string, MessageKey> = Object.fromEntries(
  [...TEST_CHECKLIST_SECTIONS, ...SHIPMENT_CHECKLIST_SECTIONS].map((e) => [
    e.key,
    e.titleKey,
  ]),
);

export function sectionsForTemplateType(
  type: string,
): ChecklistSectionCatalogEntry[] {
  const t = type.toUpperCase();
  if (t === 'TEST') return TEST_CHECKLIST_SECTIONS;
  if (t === 'SHIPMENT') return SHIPMENT_CHECKLIST_SECTIONS;
  return [];
}

export function catalogSortForSectionKey(
  type: string,
  key: string | null | undefined,
): number | null {
  if (!key) return null;
  const hit = sectionsForTemplateType(type).find((e) => e.key === key);
  return hit ? hit.sort : 500;
}

/** Resolve a section heading: i18n for known keys, raw key for custom, Other for null. */
export function checklistSectionTitle(
  sectionKey: string | null | undefined,
  t: Translate,
): string {
  if (!sectionKey) return t('checklist.section.other');
  const titleKey = KNOWN_TITLE[sectionKey];
  if (titleKey) return t(titleKey);
  return sectionKey;
}

export type SectionableItem = {
  ItemID: number;
  ItemNo: number;
  SectionKey?: string | null;
  SectionSort?: number | null;
};

export type ChecklistSectionGroup<T extends SectionableItem> = {
  sectionKey: string | null;
  sectionSort: number;
  title: string;
  items: T[];
};

/**
 * Group items by SectionKey. Order: section_sort asc, then key, then ItemNo.
 * Unsectioned (null/empty key) land under "Other items" at the end.
 */
export function groupItemsBySectionKey<T extends SectionableItem>(
  items: T[],
  t: Translate,
): ChecklistSectionGroup<T>[] {
  type Bucket = {
    sectionKey: string | null;
    sectionSort: number;
    items: T[];
  };
  const buckets = new Map<string, Bucket>();

  for (const item of items) {
    const raw = item.SectionKey?.trim() || null;
    const mapKey = raw ?? '';
    let bucket = buckets.get(mapKey);
    if (!bucket) {
      const sort =
        item.SectionSort != null
          ? item.SectionSort
          : raw
            ? 500
            : 9999;
      bucket = { sectionKey: raw, sectionSort: sort, items: [] };
      buckets.set(mapKey, bucket);
    } else if (
      item.SectionSort != null &&
      item.SectionSort < bucket.sectionSort
    ) {
      bucket.sectionSort = item.SectionSort;
    }
    bucket.items.push(item);
  }

  const groups = [...buckets.values()].map((b) => {
    b.items.sort((a, b2) => a.ItemNo - b2.ItemNo);
    return {
      sectionKey: b.sectionKey,
      sectionSort: b.sectionSort,
      title: checklistSectionTitle(b.sectionKey, t),
      items: b.items,
    };
  });

  groups.sort((a, b) => {
    if (a.sectionSort !== b.sectionSort) return a.sectionSort - b.sectionSort;
    const ak = a.sectionKey ?? '';
    const bk = b.sectionKey ?? '';
    return ak.localeCompare(bk);
  });

  return groups;
}
