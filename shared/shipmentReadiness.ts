import type { Translate } from './i18n';
import { checklistStatusLabel } from './vehicleStatus';

/** One entry of GET /vehicles/{vin}/shipment-readiness `warnings`. */
export type ShipmentWarningLike = {
  code: string;
  /** Turkish fallback from older backends; not shown when fields are present. */
  message: string;
  checklist_type?: string;
  item_id?: number;
  item_no?: number;
  item_text?: string;
  item_status?: string;
  issue_id?: number;
  issue_status?: string;
  issue_description?: string;
  remaining_count?: number;
  read_failed?: boolean;
};

function checklistListLabel(type: string | undefined, t: Translate): string {
  return type === 'TEST' ? t('vehicles.readinessListTest') : t('vehicles.readinessListEol');
}

/** Localized line for a pre-shipment warning, built from structured fields. */
export function shipmentWarningText(
  w: ShipmentWarningLike,
  t: Translate,
  issueStatusLabel: (status: string) => string,
): string {
  if (w.read_failed) {
    return t('vehicles.readinessReadFailed', { list: checklistListLabel(w.checklist_type, t) });
  }
  if (w.code === 'STATION_STEPS_INCOMPLETE' && w.remaining_count != null) {
    return t('vehicles.readinessStationSteps', { n: w.remaining_count });
  }
  if (w.code === 'OPEN_ISSUE' && w.issue_id != null) {
    return t('vehicles.readinessIssue', {
      id: w.issue_id,
      status: issueStatusLabel(w.issue_status ?? ''),
      text: w.issue_description ?? '',
    });
  }
  if (w.item_no != null && w.item_text != null) {
    const line = t('vehicles.readinessItem', {
      list: checklistListLabel(w.checklist_type, t),
      n: w.item_no,
      text: w.item_text,
      status: checklistStatusLabel(w.item_status ?? '', t),
    });
    return w.remaining_count
      ? t('vehicles.readinessMore', { line, n: w.remaining_count })
      : line;
  }
  return w.message;
}
