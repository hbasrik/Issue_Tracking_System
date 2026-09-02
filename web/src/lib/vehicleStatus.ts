import type { Translate } from '../../../shared/i18n';

export function vehicleStatusLabel(status: string, t: Translate): string {
  switch (status) {
    case 'PLANNED':
      return t('status.vehicle.planned');
    case 'IN_PRODUCTION':
      return t('status.vehicle.inProduction');
    case 'IN_WAREHOUSE':
      return t('status.vehicle.inWarehouse');
    case 'DELIVERED':
    case 'WITH_CUSTOMER':
      return t('status.vehicle.delivered');
    case 'SHIPPED':
      return t('status.vehicle.shipped');
    case 'ON_HOLD':
      return t('status.vehicle.onHold');
    case '':
      return t('status.vehicle.all');
    default:
      return status;
  }
}

export function eolStageLabel(stage: string, t: Translate): string {
  switch (stage) {
    case 'BRANCH':
      return t('status.eolStage.branch');
    case 'DEPOT':
      return t('status.eolStage.depot');
    case 'COMPLETED':
      return t('status.eolStage.completed');
    case 'DOCUMENT':
      return t('checklist.documentShort');
    default:
      return stage;
  }
}

export function checklistStatusLabel(status: string, t: Translate): string {
  switch (status) {
    case 'OK':
      return t('status.eol.ok');
    case 'NOT_OK':
      return t('status.eol.notOk');
    case 'REWORK':
      return t('status.eol.rework');
    case 'CONDITIONAL_OK':
      return t('status.eol.conditionalOk');
    case 'PENDING':
    case '':
      return t('print.pending');
    default:
      return status;
  }
}

export function isOpenIssueStatus(status: string): boolean {
  return status === 'OPEN' || status === 'IN_PROGRESS' || status === 'DONE';
}
