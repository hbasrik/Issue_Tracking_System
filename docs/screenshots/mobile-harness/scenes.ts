/**
 * Scenes for the mobile harness: which real screen to render and what the
 * stubbed API returns. Shapes follow the live API responses; item texts are
 * from the real templates. Select with ?scene=<id>.
 */
import type { ComponentType } from 'react';
// Real API response from a *_test database after migration 0035.
import sectionChecklists from '../checklist-sections/api-checklists.json';
import processChecklists from '../shipment-sections-process/api-checklists.json';
// Real GET /vehicles/{vin}/timeline response from karea_timeline_test (docs/16 A40).
import vehicleTimeline from '../vehicle-timeline/api-timeline.json';

type Status = 'PENDING' | 'OK' | 'NOT_OK' | 'REWORK' | 'CONDITIONAL_OK';

export type SceneScreen =
  | 'vehicle-station' | 'test' | 'eol' | 'my-issues' | 'issue-detail' | 'pending-reports';

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
    checklists?: Partial<Record<'eol' | 'test', unknown[]>>;
    eolWorkflow?: unknown;
    issue?: unknown;
    issueHistory?: unknown[];
    timeline?: unknown;
  };
  live?: LiveData;
  /**
   * offline starts the app-level connectivity flag false; pickPhoto makes the
   * gallery picker return one image; uploadError makes uploadMedia throw a
   * transport error with that message (connection lost mid-upload). proxy
   * sends vehicle, checklist and EoL reads and checklist/media writes to
   * http://karea-proxy/api/v1, which the Playwright script routes to a test
   * API (never live); `api` is then unused.
   */
  harness?: { offline?: boolean; pickPhoto?: boolean; uploadError?: string; proxy?: boolean };
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
const TIMELINE_VIN = 'N7V1K1SA6TK000006';
const DELIVERED_VIN = 'N7V1K1SA9TK000016';

// EoL items as seed 03 builds them (Karar 30): KY.FR-09 branch items, a kept
// branch item in "Fiziksel testler", KY.FR-19 depot items and the kept
// Bumpy Road in "Ek kontroller". Answered items carry the answer copy the
// API returns (AnsweredCriteria) next to the template's current values.
function eolItem(
  id: number,
  no: number,
  text: string,
  status: Status,
  form: { phase: 'BRANCH' | 'DEPOT'; section: string; sort: number; criterion?: string; method?: string },
  extra: Record<string, unknown> = {},
) {
  const criteria = {
    ...(form.criterion ? { AcceptanceCriterion: form.criterion } : {}),
    ...(form.method ? { ControlMethod: form.method } : {}),
  };
  return item(id, no, text, status, {
    EolPhase: form.phase,
    SectionKey: form.section,
    SectionSort: form.sort,
    ...criteria,
    ...(status !== 'PENDING' ? { AnsweredCriteria: { ...criteria, CopiedAt: ago(48) } } : {}),
    ...extra,
  });
}

const FR09_ENTRY = { phase: 'BRANCH', section: 'eol_entry', sort: 10 } as const;
const FR09_EXTERIOR = { phase: 'BRANCH', section: 'eol_exterior', sort: 20 } as const;
const KEPT_BRANCH = { phase: 'BRANCH', section: 'eol_physical_tests', sort: 60 } as const;
const FR19_IDENTITY = { phase: 'DEPOT', section: 'final_identity', sort: 110 } as const;
const FR19_MECHANICAL = { phase: 'DEPOT', section: 'final_mechanical', sort: 150 } as const;
const KEPT_DEPOT = { phase: 'DEPOT', section: 'final_extra_checks', sort: 200 } as const;

const eolBranch = (closed: boolean, depot: Status[]) => [
  eolItem(1, 1, 'Araç kimliği ve varyant', 'OK',
    { ...FR09_ENTRY, criterion: 'Araç ve kayıt bilgileri eşleşmeli', method: 'Kayıt / etiket karşılaştırma' },
    { CheckerName: 'Quality Operator' }),
  eolItem(2, 2, 'Üretim teslim kaydı', 'OK',
    { ...FR09_ENTRY, criterion: 'Üretim tamam; açık uygunsuzluk olmamalı', method: 'Üretim kaydı inceleme' },
    { CheckerName: 'Quality Operator' }),
  eolItem(3, 3, 'Genel boya ve kozmetik kontrolü', 'OK',
    { ...FR09_EXTERIOR, criterion: 'Kusur kataloğu sınırları içinde olmalı', method: 'Görsel' },
    { CheckerName: 'Quality Operator' }),
  eolItem(113, 44, 'Far Ayarı', 'PENDING', KEPT_BRANCH, { StageClosed: closed }),
  eolItem(11, 47, 'Şasi ve seri numarası okunaklı ve doğru', depot[0],
    { ...FR19_IDENTITY, method: 'Doküman/Etiket kontrol' }),
  eolItem(12, 79, 'Fren hortum ve hatlarında sıvı kaçağı yok', depot[1],
    { ...FR19_MECHANICAL, method: 'Görsel kontrol' },
    depot[1] === 'NOT_OK'
      ? { RejectedDesc: 'Sol ön fren hortumu bağlantısında sıvı izi.', Note: 'Sol ön fren hortumu bağlantısında sıvı izi.' }
      : {}),
  eolItem(13, 103, 'Bumpy Road', depot[2], KEPT_DEPOT),
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
const eolPhoto = (itemId: number, n: number) => ({
  id: 500 + n,
  entity_type: 'CHECKLIST_ITEM_PROGRESS',
  entity_id: String(1000 + itemId),
  vin: LINE_VIN,
  file_name: `eol-${n}.jpg`,
  storage_path: PHOTO,
  mime_type: 'image/jpeg',
  file_size: 1024,
  uploaded_by: 3,
  uploaded_at: ago(2),
});
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
    id: 'vehicle-timeline',
    screen: 'vehicle-station',
    params: { vin: TIMELINE_VIN },
    api: {
      vehicle: vehicle(TIMELINE_VIN, 'IN_PRODUCTION', null, 100),
      issues: [],
      timeline: vehicleTimeline,
    },
  },
  {
    id: 'station-line',
    screen: 'vehicle-station',
    params: { vin: LINE_VIN },
    api: { vehicle: vehicle(LINE_VIN, 'IN_PRODUCTION', null, 43.53), stationSteps, issues: [] },
  },
  {
    // Karar 33: the pre-shipment warning lists Test and EoL items only and
    // the station screen has no Shipment checklist button.
    id: 'station-readiness',
    screen: 'vehicle-station',
    params: { vin: LINE_VIN },
    api: {
      vehicle: vehicle(LINE_VIN, 'IN_PRODUCTION', null, 43.53),
      stationSteps,
      issues: [],
      readiness: {
        vin: LINE_VIN,
        status: 'IN_PRODUCTION',
        ready: false,
        warnings: [
          { code: 'STATION_STEPS_INCOMPLETE', message: '3 istasyon adımı tamamlanmadı', remaining_count: 3 },
          {
            code: 'TEST_INCOMPLETE', message: 'Test checklist maddesi 2', checklist_type: 'TEST',
            item_id: 21, item_no: 2, item_text: 'Fren testi', item_status: 'PENDING',
          },
          {
            code: 'EOL_INCOMPLETE', message: 'EOL checklist maddesi 1', checklist_type: 'EOL',
            item_id: 1, item_no: 1, item_text: 'Boya yüzeyi', item_status: 'PENDING',
          },
        ],
      },
    },
  },
  {
    id: 'test-sections',
    screen: 'test',
    params: { vin: LINE_VIN },
    api: { checklists: { test: sectionChecklists.test } },
  },
  {
    id: 'test-process-sections',
    screen: 'test',
    params: { vin: LINE_VIN },
    api: { checklists: { test: processChecklists.test } },
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
    id: 'eol-photo-online',
    screen: 'eol',
    params: { vin: LINE_VIN },
    api: {
      vehicle: vehicle(LINE_VIN, 'IN_PRODUCTION', 'BRANCH', 43.53),
      checklists: { eol: eolBranch(false, ['PENDING', 'PENDING', 'PENDING']) },
      eolWorkflow: eolWorkflow(LINE_VIN, 'BRANCH', null, null, 3),
    },
    harness: { pickPhoto: true },
  },
  {
    id: 'eol-photo-offline',
    screen: 'eol',
    params: { vin: LINE_VIN },
    api: {
      vehicle: vehicle(LINE_VIN, 'IN_PRODUCTION', 'BRANCH', 43.53),
      checklists: { eol: eolBranch(false, ['PENDING', 'PENDING', 'PENDING']) },
      eolWorkflow: eolWorkflow(LINE_VIN, 'BRANCH', null, null, 3),
    },
    harness: { offline: true, pickPhoto: true },
  },
  {
    id: 'eol-photo-upload-fails',
    screen: 'eol',
    params: { vin: LINE_VIN },
    api: {
      vehicle: vehicle(LINE_VIN, 'IN_PRODUCTION', 'BRANCH', 43.53),
      checklists: { eol: eolBranch(false, ['PENDING', 'PENDING', 'PENDING']) },
      eolWorkflow: eolWorkflow(LINE_VIN, 'BRANCH', null, null, 3),
    },
    harness: { pickPhoto: true, uploadError: 'Network request failed' },
  },
  {
    id: 'eol-photos-list',
    screen: 'eol',
    params: { vin: LINE_VIN },
    api: {
      vehicle: vehicle(LINE_VIN, 'IN_PRODUCTION', 'BRANCH', 43.53),
      checklists: {
        eol: eolBranch(false, ['PENDING', 'PENDING', 'PENDING']).map((it) =>
          it.ItemID === 1 ? { ...it, Note: 'ölçüm 12.6', Photos: [1, 2, 3].map((n) => eolPhoto(it.ItemID, n)) }
            : it.ItemID === 2 ? { ...it, Photos: [eolPhoto(it.ItemID, 4)] }
              : { ...it, Photos: [] }),
      },
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
  {
    // Real EOLChecklistScreen against a test API; ?vin= picks the vehicle.
    id: 'proxy-eol',
    screen: 'eol',
    params: { vin: new URLSearchParams(location.search).get('vin') ?? '' },
    api: {},
    harness: { proxy: true },
  },
];

export function activeScene(): Scene {
  const id = new URLSearchParams(location.search).get('scene') ?? SCENES[0].id;
  const scene = SCENES.find((s) => s.id === id);
  if (!scene) throw new Error(`unknown scene ${id}`);
  return scene;
}

export type ScreenMap = Record<SceneScreen, ComponentType>;
