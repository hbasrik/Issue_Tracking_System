/**
 * Scenes for the mobile harness: which real screen to render and what the
 * stubbed API returns. Shapes follow the live API responses; item texts are
 * from the real templates. Select with ?scene=<id>.
 */
import type { ComponentType } from 'react';

type Status = 'PENDING' | 'OK' | 'NOT_OK' | 'REWORK' | 'CONDITIONAL_OK';

export type SceneScreen = 'vehicle-station' | 'shipment' | 'test' | 'eol' | 'my-issues';

export interface Scene {
  id: string;
  screen: SceneScreen;
  params: Record<string, unknown>;
  api: {
    vehicle?: unknown;
    stationSteps?: unknown;
    issues?: unknown[];
    readiness?: unknown;
    checklists?: Partial<Record<'eol' | 'shipment' | 'test', unknown[]>>;
    eolWorkflow?: unknown;
  };
}

const HOUR = 3_600_000;
const ago = (h: number) => new Date(Date.now() - h * HOUR).toISOString();

function item(
  id: number,
  no: number,
  text: string,
  status: Status,
  extra: Record<string, unknown> = {},
) {
  const done = status !== 'PENDING';
  return {
    ItemID: id,
    ItemNo: no,
    ItemText: text,
    Status: status,
    IsActive: true,
    StageClosed: false,
    ProgressID: done ? 1000 + id : null,
    CheckerName: done ? 'Assembly Operator' : undefined,
    CheckDate: done ? ago(48) : null,
    ...extra,
  };
}

const SHIPMENT_TEXTS: [number, number, string][] = [
  [39, 24, 'Arka davlumbaz sol fren borusu girişim bölgesi kesimi'],
  [40, 25, 'Arka davlumbaz sağ fren borusu girişim bölgesi kesimi'],
  [41, 26, 'Direksiyon yumuşatma ayarı'],
  [42, 27, 'Stop delik genişletme yapıldı mı'],
  [43, 28, 'Kaput ayar pulu atıldı mı'],
  [44, 44, 'Direksiyon kolonu dip lastiği yerine tam olarak oturmuş mu'],
  [45, 45, 'Kaput civatalarının piano black rötuş kalemi ile boyanması'],
  [46, 46, 'Bagaj kapağı su sızdırma problemi parça entegrasyonu'],
];
const LATE_SHIPMENT = { id: 112, no: 47, text: 'Bagaj kilidi kontrolü' };

const vehicle = (vin: string, status: string, stage: string | null, pct: number) => ({
  VIN: vin,
  VehicleModelID: 1,
  CurrentGlobalStatus: status,
  CurrentEOLStage: stage,
  CurrentStationID: 8,
  TotalProgressPercentage: pct,
});

const stage = (h: number | null, by = 'Local Manager') =>
  h == null ? { at: null, by_user_id: null } : { at: ago(h), by_user_id: 3, by_name: by };

function eolWorkflow(vin: string, current: string, branchH: number | null, depotH: number | null, depotRemaining: number) {
  return {
    vin,
    current_stage: current,
    branch_ship: stage(branchH),
    depot_release: stage(depotH),
    document_approve: stage(null),
    deliver: stage(null),
    branch_open_issue_count_at_shipment: branchH == null ? null : 0,
    gates: {
      branch_ship: {
        ready: false, already_done: branchH != null,
        branch_eol_remaining: 0, branch_eol_missing: 0,
        test_remaining: 0, test_missing: 0,
        shipment_remaining: 0, shipment_missing: 0,
        station_steps_remaining: 0, open_issue_count: 0,
      },
      depot_release: {
        ready: false, already_done: depotH != null, needs_branch_ship: branchH == null,
        depot_eol_remaining: depotRemaining, depot_eol_missing: 0, open_issue_count: 0,
      },
      deliver: { ready: depotH != null, already_done: false, needs_depot_release: depotH == null },
    },
  };
}

const PASSED_VIN = 'N7V1K1SA3TK000013';
const BRANCH_VIN = 'N7V1K1SA1TK000012';
const LINE_VIN = 'N7V1K1SA1TK000009';
const DELIVERED_VIN = 'N7V1K1SA9TK000016';

const shipmentPassed = [
  ...SHIPMENT_TEXTS.map(([id, no, text]) => item(id, no, text, 'OK')),
  item(LATE_SHIPMENT.id, LATE_SHIPMENT.no, LATE_SHIPMENT.text, 'PENDING', { StageClosed: true }),
  item(90, 12, 'Eski tampon braketi kontrolü', 'OK', { IsActive: false }),
];

const shipmentDelivered = [
  ...SHIPMENT_TEXTS.map(([id, no, text]) => item(id, no, text, 'OK')),
  item(LATE_SHIPMENT.id, LATE_SHIPMENT.no, LATE_SHIPMENT.text, 'PENDING', { StageClosed: true }),
  item(91, 30, 'Yan ayna kapak klipsi', 'NOT_OK', { StageClosed: true }),
];

const shipmentLine = [
  ...SHIPMENT_TEXTS.map(([id, no, text]) => item(id, no, text, 'PENDING')),
  item(LATE_SHIPMENT.id, LATE_SHIPMENT.no, LATE_SHIPMENT.text, 'PENDING'),
];

const eolBranch = (closed: boolean, depot: Status[]) => [
  item(1, 1, 'Software Update', 'OK', { EolPhase: 'BRANCH', CheckerName: 'Quality Operator' }),
  item(2, 2, 'Fren Testi', 'OK', { EolPhase: 'BRANCH', CheckerName: 'Quality Operator' }),
  item(3, 3, 'Far Ayarı', 'OK', { EolPhase: 'BRANCH', CheckerName: 'Quality Operator' }),
  item(113, 16, 'Şarj kapağı kontrolü', 'PENDING', { EolPhase: 'BRANCH', StageClosed: closed }),
  item(11, 11, 'Depo Sürüş', depot[0], { EolPhase: 'DEPOT' }),
  item(12, 12, 'Bumpy Road', depot[1], { EolPhase: 'DEPOT', RejectedDesc: 'Visible coolant weep at water-pump housing.' }),
  item(13, 13, 'Yağmur Testi', depot[2], { EolPhase: 'DEPOT' }),
];

const stationSteps = {
  Items: [
    { ID: 1, StationID: 7, StationName: 'Trim Station', SequenceNo: 7, Name: 'Kapı döşemeleri', Status: 'OK', CheckedByName: 'Assembly Operator', CheckedAt: ago(30) },
    { ID: 2, StationID: 8, StationName: 'Final Assembly Station', SequenceNo: 8, Name: 'Tork kontrolü', Status: 'PENDING' },
  ],
  OpenIssuesByStation: {},
};

const ISSUE_VIN = 'KAREA0LAYOUT00042';
const PHOTO =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="192" height="144"><rect width="192" height="144" fill="#8E9E7C"/><circle cx="96" cy="72" r="40" fill="#C0A89B"/></svg>';
const issue = (id: number, severity: string, status: string, description: string, h: number, extra: Record<string, unknown> = {}) => ({
  ID: id,
  VIN: ISSUE_VIN,
  SourceType: 'STATION',
  IssueReporterID: 1,
  Severity: severity,
  Status: status,
  Description: description,
  IssueDate: ago(h),
  ...extra,
});
const issues = [
  issue(101, 'CRITICAL', 'OPEN', 'Sol ön kapı menteşesinde boşluk', 50, {
    ReportPhotoPath: PHOTO,
    DefectPartNameTR: 'Ön kapı', DefectPartNameEN: 'Front door', DefectTypeNameTR: 'Boşluk', DefectTypeNameEN: 'Gap',
  }),
  issue(102, 'MEDIUM', 'CONDITIONAL_APPROVED',
    'Arka tampon sağ alt köşesinde boya akıntısı ve hafif portakallanma, müşteri görünür bölgede, tekrar boya kabinine gönderilmeli mi değerlendirilecek',
    30, {
      ConditionalApproveDate: ago(4),
      DefectPartID: 99,
      DefectTypeID: 99,
      CustomPartName: 'Arka tampon sağ alt köşe bağlantı braketi ve plastik koruma kapağı montaj bölgesi',
      CustomDefectName: 'Boya akıntısı / portakallanma / renk tonu farkı',
    }),
  issue(103, 'LOW', 'APPROVED', 'Torpido kapağı hafif gıcırtı', 6, {
    ApproveDate: ago(1),
    DefectPartNameTR: 'Torpido', DefectPartNameEN: 'Glovebox', DefectTypeNameTR: 'Ses', DefectTypeNameEN: 'Noise',
  }),
  issue(104, 'MEDIUM', 'IN_PROGRESS', 'Bagaj contası tam oturmuyor', 0.3),
  issue(105, 'CRITICAL', 'DONE',
    'Soğutmasuyupompagövdesibağlantısızdırmazlıkcontasıkontrolü_uzun_kelime_bölünmeden_devam_ediyor ve ardından normal cümle',
    75, { ReportPhotoPath: PHOTO }),
];

export const SCENES: Scene[] = [
  {
    id: 'issues-list',
    screen: 'my-issues',
    params: {},
    api: { issues },
  },
  {
    id: 'vehicle-issues',
    screen: 'vehicle-station',
    params: { vin: ISSUE_VIN },
    api: { vehicle: vehicle(ISSUE_VIN, 'IN_PRODUCTION', null, 38), stationSteps, issues },
  },
  {
    id: 'station-line',
    screen: 'vehicle-station',
    params: { vin: LINE_VIN },
    api: { vehicle: vehicle(LINE_VIN, 'IN_PRODUCTION', null, 43.53), stationSteps, issues: [] },
  },
  {
    id: 'shipment-passed',
    screen: 'shipment',
    params: { vin: PASSED_VIN },
    api: { checklists: { shipment: shipmentPassed } },
  },
  {
    id: 'shipment-delivered',
    screen: 'shipment',
    params: { vin: DELIVERED_VIN },
    api: { checklists: { shipment: shipmentDelivered } },
  },
  {
    id: 'shipment-line',
    screen: 'shipment',
    params: { vin: LINE_VIN },
    api: { checklists: { shipment: shipmentLine } },
  },
  {
    id: 'eol-branch-shipped',
    screen: 'eol',
    params: { vin: BRANCH_VIN },
    api: {
      vehicle: vehicle(BRANCH_VIN, 'IN_WAREHOUSE', 'DEPOT', 96.43),
      checklists: { eol: eolBranch(true, ['PENDING', 'NOT_OK', 'PENDING']) },
      eolWorkflow: eolWorkflow(BRANCH_VIN, 'DEPOT', 24, null, 2),
    },
  },
  {
    id: 'eol-line',
    screen: 'eol',
    params: { vin: LINE_VIN },
    api: {
      vehicle: vehicle(LINE_VIN, 'IN_PRODUCTION', 'BRANCH', 43.53),
      checklists: { eol: eolBranch(false, ['PENDING', 'PENDING', 'PENDING']) },
      eolWorkflow: eolWorkflow(LINE_VIN, 'BRANCH', null, null, 3),
    },
  },
];

export function activeScene(): Scene {
  const id = new URLSearchParams(location.search).get('scene') ?? SCENES[0].id;
  const scene = SCENES.find((s) => s.id === id);
  if (!scene) throw new Error(`unknown scene ${id}`);
  return scene;
}

export type ScreenMap = Record<SceneScreen, ComponentType>;
