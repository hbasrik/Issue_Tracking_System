/**
 * Detect CRITICAL issues that were not in the previously known ID set.
 * First call (prevKnownIds === null) establishes the baseline — no alerts.
 */
export function detectNewCriticalIds(
  prevKnownIds: Set<number> | null,
  nextItems: ReadonlyArray<{ ID: number; Severity: string }>,
): { knownIds: Set<number>; newCriticalIds: number[] } {
  const knownIds = new Set(prevKnownIds ?? []);
  if (prevKnownIds === null) {
    for (const item of nextItems) knownIds.add(item.ID);
    return { knownIds, newCriticalIds: [] };
  }
  const newCriticalIds: number[] = [];
  for (const item of nextItems) {
    if (!knownIds.has(item.ID) && item.Severity === 'CRITICAL') {
      newCriticalIds.push(item.ID);
    }
    knownIds.add(item.ID);
  }
  return { knownIds, newCriticalIds };
}
