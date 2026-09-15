/**
 * Home issue-stat helpers — re-export shared single source of truth.
 * Mobile-only label keys stay here (home.mobile.*).
 */
import type { MessageKey, Translate } from '../../../shared/i18n';
import type { HomeIssueStatKey } from '../../../shared/homeIssueStats';

export type { HomeIssueStatKey } from '../../../shared/homeIssueStats';
export {
  countHomeIssueStat,
  isHomeIssueStatKey,
  matchesHomeIssueStat,
} from '../../../shared/homeIssueStats';

/** Mobile home shows a shorter card set; keys still share shared predicates. */
export type MobileHomeIssueStatKey = Exclude<
  HomeIssueStatKey,
  'pending_quality' | 'critical'
>;

export function isMobileHomeIssueStatKey(
  value: string | null | undefined,
): value is MobileHomeIssueStatKey {
  return (
    value === 'open' ||
    value === 'in_progress' ||
    value === 'closed_today' ||
    value === 'approved_today' ||
    value === 'conditional_approved_today'
  );
}

const HOME_ISSUE_STAT_KEYS: Record<MobileHomeIssueStatKey, MessageKey> = {
  open: 'home.mobile.open',
  in_progress: 'home.mobile.inProgress',
  closed_today: 'home.mobile.closedToday',
  approved_today: 'home.mobile.approvedToday',
  conditional_approved_today: 'home.mobile.conditionalToday',
};

export function homeIssueStatLabel(
  key: MobileHomeIssueStatKey,
  t: Translate,
): string {
  return t(HOME_ISSUE_STAT_KEYS[key]);
}
