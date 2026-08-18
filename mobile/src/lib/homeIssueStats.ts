import type { Issue } from '../api/client';

/**
 * Home day-stat cards and My Issues deep-links share this matcher so the
 * count on a card and the list after tapping it stay in lockstep.
 */
export type HomeIssueStatKey =
  | 'open'
  | 'in_progress'
  | 'closed_today'
  | 'approved_today'
  | 'conditional_approved_today';

export function isSameLocalDay(iso: string | undefined, now: Date): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function isClosedStatus(status: Issue['Status']): boolean {
  return (
    status === 'DONE' ||
    status === 'APPROVED' ||
    status === 'CONDITIONAL_APPROVED'
  );
}

/** Same predicate Home uses when tallying a card. */
export function matchesHomeIssueStat(
  issue: Issue,
  key: HomeIssueStatKey,
  now: Date = new Date(),
): boolean {
  switch (key) {
    case 'open':
      return issue.Status === 'OPEN';
    case 'in_progress':
      return issue.Status === 'IN_PROGRESS';
    case 'closed_today':
      return isClosedStatus(issue.Status) && isSameLocalDay(issue.UpdatedAt, now);
    case 'approved_today':
      return issue.Status === 'APPROVED' && isSameLocalDay(issue.UpdatedAt, now);
    case 'conditional_approved_today':
      return (
        issue.Status === 'CONDITIONAL_APPROVED' &&
        isSameLocalDay(issue.UpdatedAt, now)
      );
  }
}

export function countHomeIssueStat(
  items: Issue[],
  key: HomeIssueStatKey,
  now: Date = new Date(),
): number {
  let n = 0;
  for (const issue of items) {
    if (matchesHomeIssueStat(issue, key, now)) n += 1;
  }
  return n;
}

export const HOME_ISSUE_STAT_LABELS: Record<HomeIssueStatKey, string> = {
  open: 'Açık',
  in_progress: 'Devam eden',
  closed_today: 'Kapanan (bugün)',
  approved_today: 'Kalite Onay (bugün)',
  conditional_approved_today: 'Şartlı Onay (bugün)',
};
