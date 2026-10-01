/**
 * Scenes for the mobile harness: which real screen to render and what the
 * stubbed API returns. Shapes follow the live API responses; item texts are
 * from the real templates. Select with ?scene=<id>.
 */
import type { ComponentType } from 'react';

type Status = 'PENDING' | 'OK' | 'NOT_OK' | 'REWORK' | 'CONDITIONAL_OK';

export type SceneScreen =
  | 'vehicle-station' | 'shipment' | 'test' | 'eol' | 'my-issues' | 'issue-detail' | 'pending-reports';

/**
 * Live scenes run the real reference-cache and issue-queue providers on the
 * stubbed storage and API: the queue starts from `queue`, catalogue fetches
 * return `catalog` (and `catalogAfter` from the second fetch on), and
 * createIssue rejects payloads that use `rejectPartIds`, as the backend does
 * for a deactivated part.
 */
export interface LiveData {
  userId: number;
  queue: unknown[];
  catalog: { zones: unknown[]; parts: unknown[]; types: unknown[] };
  catalogAfter?: { zones: unknown[]; parts: unknown[]; types: unknown[] };
  rejectPartIds?: number[];
}

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
    issue?: unknown;
    issueHistory?: unknown[];
  };
  live?: LiveData;
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

// --- Defect catalogue for the live queue scenes (codes and names from seed 05)
const zone = (ID: number, Code: string, NameTR: string, NameEN: string) =>
  ({ ID, Code, NameTR, NameEN, SortOrder: ID, IsActive: true });
const ZONES = [
  zone(1, '10', 'Body', 'Body'),
  zone(3, '30', 'Trim', 'Trim'),
  zone(10, '99', 'Diğer', 'Other'),
];
const part = (ID: number, ZoneID: number, Code: string, NameTR: string, NameEN: string) => {
  const z = ZONES.find((x) => x.ID === ZoneID)!;
  return {
    ID, ZoneID, Code, NameTR, NameEN, SortOrder: ID, IsActive: true,
    ZoneCode: z.Code, ZoneNameTR: z.NameTR, ZoneNameEN: z.NameEN, ZoneIsActive: true,
  };
};
const MIRROR = part(13, 3, '30-03', 'Ayna', 'Mirror');
const PARTS_AFTER = [
  part(2, 1, '10-01', 'Kapı', 'Door'),
  part(3, 1, '10-02', 'Bagaj kapağı / Tailgate', 'Tailgate / liftgate'),
  part(5, 1, '10-04', 'Tampon', 'Bumper'),
  part(11, 3, '30-01', 'Trim / Çıta / Garnish', 'Trim / moulding / garnish'),
  part(12, 3, '30-02', 'Cam', 'Glass'),
  part(15, 3, '30-05', 'Conta / Sızdırmazlık elemanı', 'Seal / weatherstrip'),
  part(1, 10, '99-99', 'Diğer', 'Other'),
];
const TYPES = [
  { ID: 1, Code: '01', NameTR: 'Boşluk / hizasızlık', NameEN: 'Gap / misalignment', SortOrder: 1, IsActive: true },
  { ID: 3, Code: '03', NameTR: 'Çizik / darbe / hasar', NameEN: 'Scratch / impact / damage', SortOrder: 3, IsActive: true },
  { ID: 5, Code: '05', NameTR: 'Eksik / yanlış parça', NameEN: 'Missing / wrong part', SortOrder: 5, IsActive: true },
  { ID: 10, Code: '99', NameTR: 'Diğer', NameEN: 'Other', SortOrder: 99, IsActive: true },
];
const CATALOG_BEFORE = { zones: ZONES, parts: [...PARTS_AFTER.slice(0, 5), MIRROR, ...PARTS_AFTER.slice(5)], types: TYPES };
const CATALOG_AFTER = { zones: ZONES, parts: PARTS_AFTER, types: TYPES };

const QUEUE_PHOTO =
  'data:image/svg+xml;base64,' +
  btoa(
    '<svg xmlns="http://www.w3.org/2000/svg" width="112" height="112"><rect width="112" height="112" fill="#5b6b7a"/>' +
      '<rect x="14" y="30" width="84" height="52" rx="8" fill="#c9d3dc"/><circle cx="56" cy="56" r="16" fill="#5b6b7a"/></svg>',
  );
export const QUEUED_ID = '6f1c2a9e-4b7d-4c1e-9a3f-2d8b5e7c1a40';
const queued = (extra: Record<string, unknown>) => ({
  id: QUEUED_ID,
  createdAt: ago(3),
  status: 'failed',
  attempts: 1,
  photoUploaded: false,
  photoUri: QUEUE_PHOTO,
  photoName: 'sag-ayna.jpg',
  photoType: 'image/jpeg',
  payload: {
    vin: 'NM0KTSKRC2XSB0142',
    source_type: 'MANUAL',
    station_id: 6,
    issue_type_id: 1,
    severity: 'MEDIUM',
    description: 'Sağ dış ayna kapağında çizik, montajda fark edildi.',
    defect_part_id: MIRROR.ID,
    defect_type_id: 3,
  },
  ...extra,
});

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
  {
    id: 'issue-detail',
    screen: 'issue-detail',
    params: { id: 101 },
    api: {
      issue: {
        ...issues[0],
        ReporterName: 'Assembly Operator',
        IssueTypeName: 'Montaj',
        StationName: 'Trim Station',
        DefectZoneNameTR: 'Kapılar', DefectZoneNameEN: 'Doors',
        DefectCode: '10-01-01',
      },
      issueHistory: [],
    },
  },
  {
    id: 'queue-rejected',
    screen: 'pending-reports',
    params: {},
    api: {},
    live: {
      userId: 7,
      queue: [queued({ lastErrorCode: 'http', lastError: 'selected catalogue item is inactive' })],
      catalog: CATALOG_AFTER,
      rejectPartIds: [MIRROR.ID],
    },
  },
  {
    id: 'queue-refresh',
    screen: 'pending-reports',
    params: {},
    api: {},
    live: {
      userId: 7,
      // Waiting for the network: the queue poll leaves it alone until nextAttemptAt.
      queue: [queued({ status: 'pending', lastErrorCode: 'network', nextAttemptAt: new Date(Date.now() + 6 * HOUR).toISOString() })],
      catalog: CATALOG_BEFORE,
      catalogAfter: CATALOG_AFTER,
      rejectPartIds: [MIRROR.ID],
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
