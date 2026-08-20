import { statusColors } from '../theme/tokens';

/** Display names for issue lifecycle statuses (web + mobile share this set). */
export function issueStatusLabel(status: string): string {
  switch (status) {
    case 'OPEN':
      return 'Açık';
    case 'IN_PROGRESS':
      return 'İşlemde';
    case 'DONE':
      return 'Tamamlandı';
    case 'APPROVED':
      return 'Kalite Onay';
    case 'CONDITIONAL_APPROVED':
      return 'Şartlı Onay';
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
      return statusColors.issueResolved;
    case 'CONDITIONAL_APPROVED':
      return statusColors.issueConditionalApproved;
    default:
      return statusColors.pending;
  }
}
