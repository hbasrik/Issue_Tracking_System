import type { Issue } from './api';
import type { MessageKey, Translate } from '../../../shared/i18n';
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
  | 'approved_today'
  | 'conditional_approved_today';

const HOME_ISSUE_STAT_KEYS: Record<HomeIssueStatKey, MessageKey> = {
  open: 'home.stat.open',
  in_progress: 'home.stat.inProgress',
  closed_today: 'home.stat.closedToday',
  approved_today: 'home.stat.approvedToday',
  conditional_approved_today: 'home.stat.conditionalToday',
};

export function homeIssueStatLabel(key: HomeIssueStatKey, t: Translate): string {
  return t(HOME_ISSUE_STAT_KEYS[key]);
}

export function isHomeIssueStatKey(value: string | null): value is HomeIssueStatKey {
  return (
    value === 'open' ||
    value === 'in_progress' ||
    value === 'closed_today' ||
    value === 'approved_today' ||
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
