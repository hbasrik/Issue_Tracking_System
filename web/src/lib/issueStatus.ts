import { statusColors } from '../theme/tokens';

export { issueStatusLabel } from '../../../shared/issueStatus';

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
