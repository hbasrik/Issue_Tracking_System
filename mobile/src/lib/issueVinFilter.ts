/**
 * Fold Turkish letters so ASCII queries match accented names:
 * huseyin/Hüseyin, namik/Namık, i/İ/ı.
 */
export function foldTurkish(value: string): string {
  return value
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');
}

/** True when the issue VIN contains the typed fragment (no vehicle_number). */
export function issueMatchesVinQuery(
  issue: { VIN: string },
  query: string,
): boolean {
  const q = query.trim().toUpperCase();
  if (!q) return true;
  return issue.VIN.toUpperCase().includes(q);
}

/**
 * VIN substring OR the opening reporter (issue_reporter_id / ReporterName).
 * Does not match vehicle_number, status labels, or later lifecycle actors.
 * Scope is the already-fetched list (analysis.view → all; else ListForUser).
 */
export function issueMatchesListQuery(
  issue: { VIN: string; ReporterName?: string },
  query: string,
): boolean {
  const q = query.trim();
  if (!q) return true;
  if (issueMatchesVinQuery(issue, q)) return true;
  return foldTurkish(issue.ReporterName ?? '').includes(foldTurkish(q));
}
