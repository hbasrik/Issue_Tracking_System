import type { Translate } from './i18n';

/** Selectable vehicle statuses in filter dropdowns/chips (SHIPPED excluded — legacy only). */
export const VEHICLE_STATUS_FILTER_VALUES = [
  'PLANNED',
  'IN_PRODUCTION',
  'IN_WAREHOUSE',
  'DELIVERED',
  'ON_HOLD',
] as const;

export type VehicleStatusFilterValue = (typeof VEHICLE_STATUS_FILTER_VALUES)[number];

/** Statuses a manager may assign on vehicle detail (no PLANNED, no SHIPPED). */
export const VEHICLE_STATUS_EDITOR_VALUES = [
  'IN_PRODUCTION',
  'IN_WAREHOUSE',
  'DELIVERED',
  'ON_HOLD',
] as const;

export type VehicleStatusEditorValue = (typeof VEHICLE_STATUS_EDITOR_VALUES)[number];

/** User-facing EOL workflow stages for list filters. */
export const EOL_STAGE_FILTER_VALUES = ['BRANCH', 'DEPOT', 'COMPLETED'] as const;

export type EolStageFilterValue = (typeof EOL_STAGE_FILTER_VALUES)[number];

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
    case 'DOCUMENT':
      return t('status.eolStage.depot');
    case 'COMPLETED':
      return t('status.eolStage.completed');
    default:
      return stage;
  }
}

/** Combined list label, e.g. "Depoda · Depo". */
export function vehicleListStatusLine(
  status: string,
  eolStage: string | null | undefined,
  t: Translate,
): string {
  const base = vehicleStatusLabel(status, t);
  if (!eolStage?.trim()) return base;
  return `${base} · ${eolStageLabel(eolStage, t)}`;
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
