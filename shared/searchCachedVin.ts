/**
 * Offline VIN typeahead against a cached vehicle list.
 * Tail matches sort first so "...12345" still feels like live search.
 */
export function searchCachedVin<T extends { VIN: string }>(
  vehicles: T[],
  query: string,
  limit = 10,
): T[] {
  const q = query.trim().toUpperCase();
  if (q.length < 2) return [];
  const matches = vehicles.filter((v) => v.VIN.toUpperCase().includes(q));
  matches.sort((a, b) => {
    const aTail = a.VIN.slice(-q.length).toUpperCase() === q ? 0 : 1;
    const bTail = b.VIN.slice(-q.length).toUpperCase() === q ? 0 : 1;
    if (aTail !== bTail) return aTail - bTail;
    return a.VIN.localeCompare(b.VIN);
  });
  return matches.slice(0, limit);
}
