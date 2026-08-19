import type { Issue } from './api';
import {
  isOpenIssueStatus,
  isQualityClosedStatus,
  parseInstant,
  qualityClosedAt,
  startOfLocalDay,
} from './homeDashboard';

/**
 * Home stat-card keys. Same idea as mobile `homeIssueStats.ts`, extended so
 * web cards and the Issues list share one matcher:
 *   open = OPEN / IN_PROGRESS / DONE (depot-release "still open" set)
 *   closed_today = quality-closed today (APPROVED | CONDITIONAL_APPROVED)
 */
export type HomeIssueStatKey =
  | 'open'
  | 'in_progress'
  | 'closed_today'
  | 'conditional_approved_today';

export const HOME_ISSUE_STAT_LABELS: Record<HomeIssueStatKey, string> = {
  open: 'Toplam Açık Hata',
  in_progress: 'İşlemde',
  closed_today: 'Bugün Kapanan',
  conditional_approved_today: 'Şartlı Onay (Bugün)',
};

export function isHomeIssueStatKey(value: string | null): value is HomeIssueStatKey {
  return (
    value === 'open' ||
    value === 'in_progress' ||
    value === 'closed_today' ||
    value === 'conditional_approved_today'
  );
}

function isSameLocalDay(atMs: number | null, now: Date): boolean {
  if (atMs == null) return false;
  const d = new Date(atMs);
  const day = startOfLocalDay(now);
  return (
    d.getFullYear() === day.getFullYear() &&
    d.getMonth() === day.getMonth() &&
    d.getDate() === day.getDate()
  );
}

/** Same predicate the Home cards use when tallying a count. */
export function matchesHomeIssueStat(
  issue: Issue,
  key: HomeIssueStatKey,
  now: Date = new Date(),
): boolean {
  switch (key) {
    case 'open':
      return isOpenIssueStatus(issue.Status);
    case 'in_progress':
      return issue.Status === 'IN_PROGRESS';
    case 'closed_today':
      return (
        isQualityClosedStatus(issue.Status) &&
        isSameLocalDay(qualityClosedAt(issue), now)
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
