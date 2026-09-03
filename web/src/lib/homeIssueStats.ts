import type { Issue } from './api';
import type { MessageKey, Translate } from '../../../shared/i18n';
import {
  isQualityClosedStatus,
  parseInstant,
  qualityClosedAt,
  startOfLocalDay,
} from './homeDashboard';

/**
 * Home stat-card keys. Same idea as mobile `homeIssueStats.ts`, extended so
 * web cards and the Issues list share one matcher:
 *   open = OPEN / IN_PROGRESS (excludes DONE — those are pending_quality)
 *   closed_today = quality-closed today (APPROVED | CONDITIONAL_APPROVED)
 */
export type HomeIssueStatKey =
  | 'open'
  | 'in_progress'
  | 'closed_today'
  | 'approved_today'
  | 'conditional_approved_today'
  | 'pending_quality'
  | 'critical';

const HOME_ISSUE_STAT_KEYS: Record<HomeIssueStatKey, MessageKey> = {
  open: 'home.stat.open',
  in_progress: 'home.stat.inProgress',
  closed_today: 'home.stat.closedToday',
  approved_today: 'home.stat.approvedToday',
  conditional_approved_today: 'home.stat.conditionalToday',
  pending_quality: 'home.stat.pendingQuality',
  critical: 'home.stat.critical',
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
    value === 'conditional_approved_today' ||
    value === 'pending_quality' ||
    value === 'critical'
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
      return issue.Status === 'OPEN' || issue.Status === 'IN_PROGRESS';
    case 'in_progress':
      return issue.Status === 'IN_PROGRESS';
    case 'pending_quality':
      return issue.Status === 'DONE';
    case 'critical':
      return (
        (issue.Status === 'OPEN' || issue.Status === 'IN_PROGRESS') &&
        issue.Severity.toUpperCase() === 'CRITICAL'
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
