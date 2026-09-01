import { statusColors } from '../theme/tokens';
import type { Translate } from '../../../shared/i18n';

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

export function issueStatusColor(status: string): string {
  switch (status) {
    case 'OPEN':
      return statusColors.issueOpen;
    case 'IN_PROGRESS':
      return statusColors.issueInProgress;
    case 'DONE':
      return statusColors.issueDone;
    case 'APPROVED':
    case 'RESOLVED':
      return statusColors.issueResolved;
    case 'CONDITIONAL_APPROVED':
      return statusColors.issueConditionalApproved;
    default:
      return statusColors.pending;
  }
}
