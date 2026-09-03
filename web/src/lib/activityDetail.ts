import type { HomeActivityEntry } from './api';
import type { Translate } from '../../../shared/i18n';

/** Build a concrete detail line for an audit activity row. */
export function activityDetailLine(
  row: Pick<
    HomeActivityEntry,
    'EventType' | 'OldValue' | 'NewValue' | 'ChecklistType' | 'ItemNo' | 'ItemText'
  >,
  t: Translate,
): string {
  const nv = row.NewValue || '';
  const ov = row.OldValue || '';

  if (row.EventType === 'CHECKLIST_ITEM_UPDATE') {
    const kind =
      row.ChecklistType === 'EOL'
        ? t('home.activity.detailEol')
        : row.ChecklistType === 'TEST'
          ? t('home.activity.detailTest')
          : row.ChecklistType === 'SHIPMENT'
            ? t('home.activity.detailShipment')
            : t('home.activity.detailChecklist');
    if (row.ItemNo != null && row.ItemNo > 0) {
      return t('home.activity.detailItemStatus', {
        kind,
        n: row.ItemNo,
        status: nv || t('common.emDash'),
      });
    }
    if (row.ItemText) {
      return `${kind}: ${row.ItemText} — ${nv || t('common.emDash')}`;
    }
  }

  if (row.EventType === 'ISSUE_STATUS_CHANGE' || row.EventType === 'STATUS_CHANGE') {
    if (ov && nv) return `${ov} → ${nv}`;
    return nv || ov || t('common.emDash');
  }

  if (row.EventType === 'EOL_WORKFLOW_STAGE_CHANGE') {
    if (ov && nv) return `${ov} → ${nv}`;
    return nv || ov || t('common.emDash');
  }

  if (row.EventType === 'MEDIA_UPLOADED') {
    return nv || t('home.activity.media');
  }

  if (ov && nv) return `${ov} → ${nv}`;
  return nv || ov || t('common.emDash');
}
