/**
 * Home issue-stat predicates — single source of truth for web and mobile.
 *
 * Definitions (product decision):
 *   open            = OPEN + IN_PROGRESS (DONE is pending quality, separate card)
 *   closed_today    = APPROVED | CONDITIONAL_APPROVED with quality-approve
 *                     timestamp on the local calendar day (not UpdatedAt —
 *                     that changes on every edit and misleads "closed today")
 *   approved_today / conditional_approved_today = same quality dates
 *
 * Card *sets* may differ by screen size; same key must yield the same count.
 */

export type HomeIssueStatKey =
  | 'open'
  | 'in_progress'
  | 'closed_today'
  | 'approved_today'
  | 'conditional_approved_today'
  | 'pending_quality'
  | 'critical';

/** Minimal issue shape both clients can satisfy. */
export type HomeStatIssue = {
  Status: string;
  Severity?: string;
  UpdatedAt?: string | null;
  ApproveDate?: string | null;
  ConditionalApproveDate?: string | null;
};

export function parseInstant(iso?: string | null): number | null {
  if (!iso) return null;
  if (iso.startsWith('0001-')) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

export function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function isSameLocalDay(atMs: number | null, now: Date): boolean {
  if (atMs == null) return false;
  const d = new Date(atMs);
  const day = startOfLocalDay(now);
  return (
    d.getFullYear() === day.getFullYear() &&
    d.getMonth() === day.getMonth() &&
    d.getDate() === day.getDate()
  );
}

export function isQualityClosedStatus(status: string): boolean {
  return status === 'APPROVED' || status === 'CONDITIONAL_APPROVED';
}

/** Prefer quality-approve timestamps; UpdatedAt is last-resort only. */
export function qualityClosedAt(issue: HomeStatIssue): number | null {
  const approved = parseInstant(issue.ApproveDate);
  const conditional = parseInstant(issue.ConditionalApproveDate);
  if (issue.Status === 'APPROVED') {
    return approved ?? conditional ?? parseInstant(issue.UpdatedAt);
  }
  if (issue.Status === 'CONDITIONAL_APPROVED') {
    return conditional ?? approved ?? parseInstant(issue.UpdatedAt);
  }
  return approved ?? conditional;
}

export function isHomeIssueStatKey(value: string | null): value is HomeIssueStatKey {
  return (
    value === 'open' ||
    value === 'in_progress' ||
    value === 'closed_today' ||
    value === 'approved_today' ||
    value === 'conditional_approved_today' ||
    value === 'pending_quality' ||
    value === 'critical'
  );
}

/** Same predicate Home cards and Issues deep-links use when tallying. */
export function matchesHomeIssueStat(
  issue: HomeStatIssue,
  key: HomeIssueStatKey,
  now: Date = new Date(),
): boolean {
  switch (key) {
    case 'open':
      return issue.Status === 'OPEN' || issue.Status === 'IN_PROGRESS';
    case 'in_progress':
      return issue.Status === 'IN_PROGRESS';
    case 'pending_quality':
      return issue.Status === 'DONE';
    case 'critical':
      return (
        (issue.Status === 'OPEN' || issue.Status === 'IN_PROGRESS') &&
        (issue.Severity ?? '').toUpperCase() === 'CRITICAL'
      );
    case 'closed_today':
      return (
        isQualityClosedStatus(issue.Status) &&
        isSameLocalDay(qualityClosedAt(issue), now)
      );
    case 'approved_today':
      return (
        issue.Status === 'APPROVED' &&
        isSameLocalDay(
          parseInstant(issue.ApproveDate) ?? parseInstant(issue.UpdatedAt),
          now,
        )
      );
    case 'conditional_approved_today':
      return (
        issue.Status === 'CONDITIONAL_APPROVED' &&
        isSameLocalDay(
          parseInstant(issue.ConditionalApproveDate) ??
            parseInstant(issue.UpdatedAt),
          now,
        )
      );
  }
}

export function countHomeIssueStat(
  items: HomeStatIssue[],
  key: HomeIssueStatKey,
  now: Date = new Date(),
): number {
  let n = 0;
  for (const issue of items) {
    if (matchesHomeIssueStat(issue, key, now)) n += 1;
  }
  return n;
}
