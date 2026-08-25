import { Perm } from '../auth/permissions';
import type { PermissionRow } from './api';

export type PermissionLabel = {
  code: string;
  label: string;
};

export type PermissionGroup = {
  id: string;
  label: string;
  items: PermissionLabel[];
};

/** Display order and Turkish names for the Roles matrix. */
export const PERMISSION_CATALOG: PermissionGroup[] = [
  {
    id: 'access',
    label: 'Erişim',
    items: [
      { code: Perm.MobileAccess, label: 'Mobil uygulamaya giriş' },
      { code: Perm.WebAccess, label: 'Web uygulamasına giriş' },
    ],
  },
  {
    id: 'vehicles',
    label: 'Araçlar',
    items: [
      { code: Perm.VehicleView, label: 'Araçları görüntüle' },
      { code: Perm.StationStepEdit, label: 'İstasyon adımı işaretle' },
    ],
  },
  {
    id: 'checklists',
    label: 'Checklistler',
    items: [
      { code: Perm.ChecklistTestView, label: 'Test checklist: görüntüle' },
      { code: Perm.ChecklistTestEdit, label: 'Test checklist: düzenle' },
      { code: Perm.ChecklistShipmentView, label: 'Shipment checklist: görüntüle' },
      { code: Perm.ChecklistShipmentEdit, label: 'Shipment checklist: düzenle' },
      { code: Perm.ChecklistEOLView, label: 'EOL checklist: görüntüle' },
      { code: Perm.ChecklistEOLEdit, label: 'EOL checklist: düzenle' },
    ],
  },
  {
    id: 'eol',
    label: 'EOL akışı',
    items: [
      { code: Perm.EOLBranchShip, label: 'Şubeden depoya sevk' },
      { code: Perm.EOLDepotRelease, label: 'Depodan serbest bırakma' },
      { code: Perm.EOLDocumentApprove, label: 'Evrak onayı' },
    ],
  },
  {
    id: 'issues',
    label: 'Hatalar',
    items: [
      { code: Perm.IssueView, label: 'Hataları görüntüle' },
      { code: Perm.IssueCreate, label: 'Hata bildir' },
      { code: Perm.IssueTransitionProgress, label: 'İşleme al / tamamla' },
      { code: Perm.IssueTransitionApprove, label: 'Kalite onayı ver' },
      { code: Perm.IssueTransitionConditionalApprove, label: 'Şartlı onay ver' },
    ],
  },
  {
    id: 'admin',
    label: 'Analiz ve Yönetim',
    items: [
      { code: Perm.AnalysisView, label: 'Analiz sayfası' },
      { code: Perm.AdminManageUsers, label: 'Kullanıcı ve rol yönetimi' },
      { code: Perm.AdminManageMasters, label: 'Ana veri yönetimi' },
    ],
  },
];

/** Catalogue groups that exist in the live API, plus any unknown codes. */
export function groupPermissions(fromApi: PermissionRow[]): PermissionGroup[] {
  const apiByCode = new Map(fromApi.map((p) => [p.code, p]));
  const groups = PERMISSION_CATALOG.map((group) => ({
    ...group,
    items: group.items.filter((item) => apiByCode.has(item.code)),
  })).filter((group) => group.items.length > 0);

  const known = new Set(PERMISSION_CATALOG.flatMap((g) => g.items.map((i) => i.code)));
  const extras = fromApi.filter((p) => !known.has(p.code));
  if (extras.length > 0) {
    groups.push({
      id: 'other',
      label: 'Diğer',
      items: extras.map((p) => ({
        code: p.code,
        label: p.description || p.code,
      })),
    });
  }
  return groups;
}
