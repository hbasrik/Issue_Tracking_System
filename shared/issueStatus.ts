import type { Translate } from './i18n';

/** Display names for issue lifecycle statuses. */
export function issueStatusLabel(status: string, t: Translate): string {
  switch (status) {
    case 'OPEN':
      return t('status.issue.open');
    case 'IN_PROGRESS':
      return t('status.issue.inProgress');
    case 'DONE':
      return t('status.issue.done');
    case 'APPROVED':
      return t('status.issue.approved');
    case 'CONDITIONAL_APPROVED':
      return t('status.issue.conditionalApproved');
    default:
      return status;
  }
}
