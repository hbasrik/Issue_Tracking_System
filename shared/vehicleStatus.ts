import type { Translate } from './i18n';

/** Unified vehicle life-cycle filter (status + EOL stage derived). */
export const VEHICLE_LIFECYCLE_FILTER_VALUES = [
  'PLANNED',
  'ON_LINE',
  'AT_DEPOT',
  'READY_TO_SHIP',
  'DELIVERED',
  'ON_HOLD',
] as const;

export type VehicleLifecycleFilterValue =
  (typeof VEHICLE_LIFECYCLE_FILTER_VALUES)[number];

/** @deprecated Prefer VEHICLE_LIFECYCLE_FILTER_VALUES */
export const VEHICLE_STATUS_FILTER_VALUES = [
  'PLANNED',
  'IN_PRODUCTION',
  'IN_WAREHOUSE',
  'DELIVERED',
  'ON_HOLD',
] as const;

export type VehicleStatusFilterValue = (typeof VEHICLE_STATUS_FILTER_VALUES)[number];

/** @deprecated Free status editor removed — workflow + hold only. */
export const VEHICLE_STATUS_EDITOR_VALUES = [
  'IN_PRODUCTION',
  'IN_WAREHOUSE',
  'DELIVERED',
  'ON_HOLD',
] as const;

export type VehicleStatusEditorValue = (typeof VEHICLE_STATUS_EDITOR_VALUES)[number];

/** @deprecated Prefer lifecycle filter */
export const EOL_STAGE_FILTER_VALUES = ['BRANCH', 'DEPOT', 'COMPLETED'] as const;

export type EolStageFilterValue = (typeof EOL_STAGE_FILTER_VALUES)[number];

export function deriveVehicleLifecycle(
  status: string,
  eolStage?: string | null,
): VehicleLifecycleFilterValue | string {
  switch (status) {
    case 'PLANNED':
      return 'PLANNED';
    case 'ON_HOLD':
      return 'ON_HOLD';
    case 'DELIVERED':
    case 'SHIPPED':
    case 'WITH_CUSTOMER':
      return 'DELIVERED';
    case 'IN_PRODUCTION':
      return 'ON_LINE';
    case 'IN_WAREHOUSE':
      return eolStage === 'COMPLETED' ? 'READY_TO_SHIP' : 'AT_DEPOT';
    default:
      return status;
  }
}

export function vehicleLifecycleLabel(
  lifecycle: string,
  t: Translate,
): string {
  switch (lifecycle) {
    case 'PLANNED':
      return t('status.lifecycle.planned');
    case 'ON_LINE':
      return t('status.lifecycle.onLine');
    case 'AT_DEPOT':
      return t('status.lifecycle.atDepot');
    case 'READY_TO_SHIP':
      return t('status.lifecycle.readyToShip');
    case 'DELIVERED':
      return t('status.lifecycle.delivered');
    case 'ON_HOLD':
      return t('status.lifecycle.onHold');
    case '':
      return t('status.vehicle.all');
    default:
      return lifecycle;
  }
}

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

/** Combined list label from status + stage → single lifecycle text. */
export function vehicleListStatusLine(
  status: string,
  eolStage: string | null | undefined,
  t: Translate,
): string {
  return vehicleLifecycleLabel(deriveVehicleLifecycle(status, eolStage), t);
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
