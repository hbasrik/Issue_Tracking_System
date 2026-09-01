import { Perm } from '../auth/permissions';
import type { PermissionRow } from './api';
import type { MessageKey, Translate } from '../../../shared/i18n';

export type PermissionLabel = {
  code: string;
  labelKey: MessageKey;
};

export type PermissionGroupDef = {
  id: string;
  labelKey: MessageKey;
  items: PermissionLabel[];
};

export type PermissionGroup = {
  id: string;
  label: string;
  items: { code: string; label: string }[];
};

/** Display order for the Roles matrix — labels resolved via i18n. */
export const PERMISSION_CATALOG: PermissionGroupDef[] = [
  {
    id: 'access',
    labelKey: 'perm.group.access',
    items: [
      { code: Perm.MobileAccess, labelKey: 'perm.mobile.access' },
      { code: Perm.WebAccess, labelKey: 'perm.web.access' },
    ],
  },
  {
    id: 'vehicles',
    labelKey: 'perm.group.vehicles',
    items: [
      { code: Perm.VehicleView, labelKey: 'perm.vehicle.view' },
      { code: Perm.StationStepEdit, labelKey: 'perm.station.step.edit' },
    ],
  },
  {
    id: 'checklists',
    labelKey: 'perm.group.checklists',
    items: [
      { code: Perm.ChecklistTestView, labelKey: 'perm.checklist.test.view' },
      { code: Perm.ChecklistTestEdit, labelKey: 'perm.checklist.test.edit' },
      { code: Perm.ChecklistShipmentView, labelKey: 'perm.checklist.shipment.view' },
      { code: Perm.ChecklistShipmentEdit, labelKey: 'perm.checklist.shipment.edit' },
      { code: Perm.ChecklistEOLView, labelKey: 'perm.checklist.eol.view' },
      { code: Perm.ChecklistEOLEdit, labelKey: 'perm.checklist.eol.edit' },
    ],
  },
  {
    id: 'eol',
    labelKey: 'perm.group.eol',
    items: [
      { code: Perm.EOLBranchShip, labelKey: 'perm.eol.branch.ship' },
      { code: Perm.EOLDepotRelease, labelKey: 'perm.eol.depot.release' },
      { code: Perm.EOLDeliver, labelKey: 'perm.eol.deliver' },
      { code: Perm.EOLDocumentApprove, labelKey: 'perm.eol.document.approve' },
    ],
  },
  {
    id: 'issues',
    labelKey: 'perm.group.issues',
    items: [
      { code: Perm.IssueView, labelKey: 'perm.issue.view' },
      { code: Perm.IssueCreate, labelKey: 'perm.issue.create' },
      { code: Perm.IssueTransitionProgress, labelKey: 'perm.issue.transition.progress' },
      { code: Perm.IssueTransitionApprove, labelKey: 'perm.issue.transition.approve' },
      {
        code: Perm.IssueTransitionConditionalApprove,
        labelKey: 'perm.issue.transition.conditional_approve',
      },
    ],
  },
  {
    id: 'admin',
    labelKey: 'perm.group.admin',
    items: [
      { code: Perm.AnalysisView, labelKey: 'perm.analysis.view' },
      { code: Perm.AdminManageUsers, labelKey: 'perm.admin.manage_users' },
      { code: Perm.AdminManageMasters, labelKey: 'perm.admin.manage_masters' },
    ],
  },
];

/** Catalogue groups that exist in the live API, plus any unknown codes. */
export function groupPermissions(
  fromApi: PermissionRow[],
  t: Translate,
): PermissionGroup[] {
  const apiByCode = new Map(fromApi.map((p) => [p.code, p]));
  const groups = PERMISSION_CATALOG.map((group) => ({
    id: group.id,
    label: t(group.labelKey),
    items: group.items
      .filter((item) => apiByCode.has(item.code))
      .map((item) => ({ code: item.code, label: t(item.labelKey) })),
  })).filter((group) => group.items.length > 0);

  const known = new Set(PERMISSION_CATALOG.flatMap((g) => g.items.map((i) => i.code)));
  const extras = fromApi.filter((p) => !known.has(p.code));
  if (extras.length > 0) {
    groups.push({
      id: 'other',
      label: t('perm.group.other'),
      items: extras.map((p) => ({
        code: p.code,
        label: p.description || p.code,
      })),
    });
  }
  return groups;
}
