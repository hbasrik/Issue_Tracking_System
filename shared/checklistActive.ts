/**
 * Split vehicle checklist API rows into work queue (active) vs historical
 * inactive ticks. Gates already ignore inactive (migration 0022); UI counts
 * must use the same active-only set so "n remaining" matches the main list.
 */

export type ChecklistActivityItem = {
  ItemID: number;
  Status: string;
  /** Catalogue flag from API. Missing/undefined treated as active. */
  IsActive?: boolean;
  EolPhase?: string | null;
};

export function isChecklistItemActive(item: ChecklistActivityItem): boolean {
  return item.IsActive !== false;
}

export function isChecklistStatusPassing(status: string): boolean {
  return status === 'OK' || status === 'CONDITIONAL_OK';
}

export function filterByEolPhase<T extends ChecklistActivityItem>(
  items: T[],
  eolPhase?: 'BRANCH' | 'DEPOT' | null,
): T[] {
  if (!eolPhase) return items;
  return items.filter((item) => item.EolPhase === eolPhase);
}

/** Active catalogue items (operator work queue). */
export function activeChecklistItems<T extends ChecklistActivityItem>(
  items: T[],
): T[] {
  return items.filter(isChecklistItemActive);
}

/**
 * Inactive items that still have a tick (API only returns these when progress
 * exists). Shown in a collapsed "no longer required" section — not deleted.
 */
export function inactiveHistoricalChecklistItems<T extends ChecklistActivityItem>(
  items: T[],
): T[] {
  return items.filter((item) => !isChecklistItemActive(item));
}

export type ChecklistActiveSplit<T extends ChecklistActivityItem> = {
  active: T[];
  inactiveHistorical: T[];
};

export function splitChecklistByActive<T extends ChecklistActivityItem>(
  items: T[],
): ChecklistActiveSplit<T> {
  const active: T[] = [];
  const inactiveHistorical: T[] = [];
  for (const item of items) {
    if (isChecklistItemActive(item)) active.push(item);
    else inactiveHistorical.push(item);
  }
  return { active, inactiveHistorical };
}

export type ChecklistActiveCounts = {
  total: number;
  passing: number;
  remaining: number;
  evaluated: number;
};

/** Progress / remaining derived only from active items. */
export function countActiveChecklistProgress(
  activeItems: ChecklistActivityItem[],
): ChecklistActiveCounts {
  let passing = 0;
  let evaluated = 0;
  for (const item of activeItems) {
    const status = item.Status || 'PENDING';
    if (status !== 'PENDING') evaluated += 1;
    if (isChecklistStatusPassing(status)) passing += 1;
  }
  const total = activeItems.length;
  return {
    total,
    passing,
    remaining: total - passing,
    evaluated,
  };
}

/** Active items that still block stage completion (UI "n missing" list). */
export function activeIncompleteChecklistItems<T extends ChecklistActivityItem>(
  activeItems: T[],
  draftStatus?: (item: T) => string | undefined,
): T[] {
  return activeItems.filter((item) => {
    const status = (draftStatus?.(item) || item.Status || 'PENDING').trim();
    if (!status || status === 'PENDING') return true;
    return !isChecklistStatusPassing(status);
  });
}
