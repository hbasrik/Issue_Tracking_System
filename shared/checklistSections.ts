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
  formRef?: string;
};

/**
 * Test checklist sections. Sort values are written to section_sort by
 * migration 0035 and seed 03; change them together.
 */
export const TEST_CHECKLIST_SECTIONS: ChecklistSectionCatalogEntry[] = [
  { key: 'cold_drag', sort: 10, titleKey: 'checklist.section.cold_drag' },
  { key: 'bcm_ee', sort: 20, titleKey: 'checklist.section.bcm_ee' },
  { key: 'road_test', sort: 30, titleKey: 'checklist.section.road_test' },
  { key: 'brake_test', sort: 40, titleKey: 'checklist.section.brake_test' },
  { key: 'alignment', sort: 50, titleKey: 'checklist.section.alignment' },
  { key: 'hot_drag', sort: 60, titleKey: 'checklist.section.hot_drag' },
  { key: 'eng_quality', sort: 70, titleKey: 'checklist.section.eng_quality' },
];

/**
 * Shipment checklist sections follow the work order: each one is a run of
 * consecutive steps (migration 0036 / seed 03; change them together).
 */
export const SHIPMENT_CHECKLIST_SECTIONS: ChecklistSectionCatalogEntry[] = [
  { key: 'interior_fit', sort: 10, titleKey: 'checklist.section.interior_fit' },
  { key: 'chassis_exterior', sort: 20, titleKey: 'checklist.section.chassis_exterior' },
  { key: 'badges_trim', sort: 30, titleKey: 'checklist.section.badges_trim' },
  { key: 'rubber_film', sort: 40, titleKey: 'checklist.section.rubber_film' },
  { key: 'brake_sealing', sort: 50, titleKey: 'checklist.section.brake_sealing' },
  { key: 'final_adjust', sort: 60, titleKey: 'checklist.section.final_adjust' },
];

/**
 * EoL sections follow the printed forms (docs/21): KY.FR-09 for the branch
 * phase (10-50), KY.FR-19 for the depot phase (110-190). The paper splits
 * "Dış" around "Gap & flush", so two keys share one title. Seed 03 writes
 * these keys and sorts; change them together. formRef tells the two apart
 * in the admin picker.
 *
 * eol_physical_tests (60) and final_extra_checks (200) hold the pre-form
 * items kept until the quality team decides on them (Karar 30). They are
 * not on either form, so they sit after each form's last section.
 */
export const EOL_CHECKLIST_SECTIONS: ChecklistSectionCatalogEntry[] = [
  { key: 'eol_entry', sort: 10, titleKey: 'checklist.section.eol_entry', formRef: 'KY.FR-09 E001–E002' },
  { key: 'eol_exterior', sort: 20, titleKey: 'checklist.section.eol_exterior', formRef: 'KY.FR-09 E003–E006' },
  { key: 'eol_gap_flush', sort: 30, titleKey: 'checklist.section.eol_gap_flush', formRef: 'KY.FR-09 E007–E010' },
  { key: 'eol_exterior_2', sort: 40, titleKey: 'checklist.section.eol_exterior', formRef: 'KY.FR-09 E011–E018' },
  { key: 'eol_interior', sort: 50, titleKey: 'checklist.section.eol_interior', formRef: 'KY.FR-09 E019–E039' },
  { key: 'eol_physical_tests', sort: 60, titleKey: 'checklist.section.eol_physical_tests' },
  { key: 'final_identity', sort: 110, titleKey: 'checklist.section.final_identity', formRef: 'KY.FR-19 1–5' },
  { key: 'final_exterior', sort: 120, titleKey: 'checklist.section.final_exterior', formRef: 'KY.FR-19 6–14' },
  { key: 'final_doors', sort: 130, titleKey: 'checklist.section.final_doors', formRef: 'KY.FR-19 15–20' },
  { key: 'final_interior', sort: 140, titleKey: 'checklist.section.final_interior', formRef: 'KY.FR-19 21–27' },
  { key: 'final_mechanical', sort: 150, titleKey: 'checklist.section.final_mechanical', formRef: 'KY.FR-19 28–34' },
  { key: 'final_electrical', sort: 160, titleKey: 'checklist.section.final_electrical', formRef: 'KY.FR-19 35–42' },
  { key: 'final_function', sort: 170, titleKey: 'checklist.section.final_function', formRef: 'KY.FR-19 46–49' },
  { key: 'final_road_test', sort: 180, titleKey: 'checklist.section.final_road_test', formRef: 'KY.FR-19 50–54' },
  { key: 'final_shipment', sort: 190, titleKey: 'checklist.section.final_shipment', formRef: 'KY.FR-19 55–59' },
  { key: 'final_extra_checks', sort: 200, titleKey: 'checklist.section.final_extra_checks' },
];

const KNOWN_TITLE: Record<string, MessageKey> = Object.fromEntries(
  [
    ...TEST_CHECKLIST_SECTIONS,
    ...SHIPMENT_CHECKLIST_SECTIONS,
    ...EOL_CHECKLIST_SECTIONS,
  ].map((e) => [e.key, e.titleKey]),
);

export function sectionsForTemplateType(
  type: string,
): ChecklistSectionCatalogEntry[] {
  const t = type.toUpperCase();
  if (t === 'TEST') return TEST_CHECKLIST_SECTIONS;
  if (t === 'SHIPMENT') return SHIPMENT_CHECKLIST_SECTIONS;
  if (t === 'EOL') return EOL_CHECKLIST_SECTIONS;
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
