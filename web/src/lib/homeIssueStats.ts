/**
 * Home issue-stat helpers — re-export shared single source of truth.
 * Web-only label keys stay here (home.stat.*).
 */
import type { MessageKey, Translate } from '../../../shared/i18n';
import type { HomeIssueStatKey } from '../../../shared/homeIssueStats';

export type { HomeIssueStatKey } from '../../../shared/homeIssueStats';
export {
  countHomeIssueStat,
  isHomeIssueStatKey,
  matchesHomeIssueStat,
  qualityClosedAt,
  isQualityClosedStatus,
  parseInstant,
  startOfLocalDay,
} from '../../../shared/homeIssueStats';

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
