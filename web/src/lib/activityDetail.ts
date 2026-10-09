import type { HomeActivityEntry } from './api';
import type { Translate } from '../../../shared/i18n';
import { classificationChangeLines } from '../../../shared/classificationChanges';
import {
  checklistStatusLabel,
  eolStageLabel,
  vehicleStatusLabel,
} from '../../../shared/vehicleStatus';
import { adminAuditDetailLine, isAdminAuditEvent, type AdminAuditLabelers } from '../../../shared/adminAudit';
import { issueStatusLabel } from './issueStatus';
import { PERMISSION_CATALOG } from './permissionLabels';
import { roleDisplayName } from './roleLabels';

const permissionKeys = new Map(
  PERMISSION_CATALOG.flatMap((g) => g.items.map((p) => [p.code, p.labelKey] as const)),
);

function adminLabelers(t: Translate): AdminAuditLabelers {
  return {
    permission: (code, description) => {
      const key = permissionKeys.get(code);
      return key ? t(key) : description || t('timeline.value.unknown');
    },
    role: (code, name) => (code ? roleDisplayName(code, t, [{ code, name }]) : name || t('common.emDash')),
  };
}

function change(
  ov: string,
  nv: string,
  label: (value: string) => string,
  emDash: string,
): string {
  if (ov && nv) return `${label(ov)} → ${label(nv)}`;
  if (nv || ov) return label(nv || ov);
  return emDash;
}

/**
 * Detail line for an audit activity row. Every stored value is shown by its
 * translated name ("Açık → İşlemde"); classification rows list the resolved
 * field changes (the responsible process is never shown).
 */
export function activityDetailLine(
  row: Pick<
    HomeActivityEntry,
    'EventType' | 'OldValue' | 'NewValue' | 'ChecklistType' | 'ItemNo' | 'ItemText' | 'Classification' | 'Admin'
  >,
  t: Translate,
  locale: string,
): string {
  if (isAdminAuditEvent(row.EventType)) {
    return adminAuditDetailLine(row.Admin, t, locale, adminLabelers(t));
  }
  const nv = row.NewValue || '';
  const ov = row.OldValue || '';
  const emDash = t('common.emDash');

  switch (row.EventType) {
    case 'CHECKLIST_ITEM_UPDATE': {
      const kind =
        row.ChecklistType === 'EOL'
          ? t('home.activity.detailEol')
          : row.ChecklistType === 'TEST'
            ? t('home.activity.detailTest')
            : t('home.activity.detailChecklist');
      const status = change(ov, nv, (v) => checklistStatusLabel(v, t), emDash);
      if (row.ItemNo != null && row.ItemNo > 0) {
        return t('home.activity.detailItemStatus', { kind, n: row.ItemNo, status });
      }
      if (row.ItemText) return `${kind}: ${row.ItemText} — ${status}`;
      return `${kind} — ${status}`;
    }
    case 'ISSUE_STATUS_CHANGE':
      if ((ov === 'APPROVED' || ov === 'CONDITIONAL_APPROVED') && nv === 'DONE') {
        return t('home.activity.approvalUndone');
      }
      return change(ov, nv, (v) => issueStatusLabel(v, t), emDash);
    case 'STATUS_CHANGE':
      return change(ov, nv, (v) => vehicleStatusLabel(v, t), emDash);
    case 'EOL_WORKFLOW_STAGE_CHANGE':
      return change(ov, nv, (v) => eolStageLabel(v, t), emDash);
    case 'ISSUE_CLASSIFICATION_CHANGE':
      // Absent (not null) means an API build that does not resolve changes.
      if (row.Classification === undefined) return t('common.emDash');
      return classificationChangeLines(row.Classification, t, locale).join(' · ');
    case 'MEDIA_UPLOADED':
      return t('home.activity.media');
    default:
      return change(ov, nv, (v) => v, emDash);
  }
}
