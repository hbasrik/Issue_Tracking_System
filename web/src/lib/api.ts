/**
 * Single API client for the Karea web dashboard.
 * All pages/components must call through this module — never hardcode the API origin.
 */

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ||
  'http://localhost:8080/api/v1';

if (import.meta.env.DEV) {
  console.info('[karea] API_BASE_URL', API_BASE_URL);
}

export type UserRole = 'OPERATOR' | 'MANAGER_ADMIN';

export interface User {
  ID: number;
  FullName: string;
  Email: string;
  Role: UserRole;
  IsActive: boolean;
  CreatedAt?: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface BlockingIssue {
  id: number;
  status: string;
  severity: string;
}

export interface ApiErrorBody {
  error: string;
  blocking_item_ids?: number[];
  blocking_issues?: BlockingIssue[];
}

export class ApiError extends Error {
  status: number;
  body: ApiErrorBody;

  constructor(status: number, body: ApiErrorBody) {
    super(body.error || `HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

type TokenGetter = () => string | null;

let getToken: TokenGetter = () => null;

/** Wire the auth token source (called once from AuthProvider). */
export function setTokenGetter(fn: TokenGetter): void {
  getToken = fn;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (
    !headers.has('Content-Type') &&
    options.body &&
    !(options.body instanceof FormData)
  ) {
    headers.set('Content-Type', 'application/json');
  }
  const token = getToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let body: ApiErrorBody = { error: res.statusText };
    try {
      body = (await res.json()) as ApiErrorBody;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, body);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

export const api = {
  login(email: string, password: string) {
    return request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  listUsers() {
    return request<{ items: User[] }>('/users');
  },

  updateUser(id: number, body: { role?: UserRole; is_active?: boolean }) {
    return request<User>(`/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },

  listVehicles(params: {
    vin?: string;
    status?: string;
    model?: string;
    station?: string;
    page?: number;
    analysis_stat?: string;
    from?: string;
    to?: string;
  }) {
    const q = new URLSearchParams();
    if (params.vin) q.set('vin', params.vin);
    if (params.status) q.set('status', params.status);
    if (params.model) q.set('model', params.model);
    if (params.station) q.set('station', params.station);
    if (params.page) q.set('page', String(params.page));
    if (params.analysis_stat) q.set('analysis_stat', params.analysis_stat);
    if (params.from) q.set('from', params.from);
    if (params.to) q.set('to', params.to);
    const qs = q.toString();
    return request<{
      Items: Vehicle[];
      Total: number;
      Page: number;
      Size: number;
    }>(`/vehicles${qs ? `?${qs}` : ''}`);
  },

  getVehicle(vin: string) {
    return request<Vehicle>(`/vehicles/${encodeURIComponent(vin)}`);
  },

  searchVehicles(vinSuffix: string) {
    const q = new URLSearchParams({ vin_suffix: vinSuffix });
    return request<{ items: Vehicle[] }>(`/vehicles/search?${q}`);
  },

  listStations() {
    return request<{ items: Station[] }>('/stations');
  },

  listChecklistTemplates() {
    return request<{ items: ChecklistTemplate[] }>('/checklist-templates');
  },

  listChecklistTemplateItems(templateId: number) {
    return request<{ items: ChecklistTemplateItem[] }>(
      `/checklist-templates/${templateId}/items`,
    );
  },

  getVehicleChecklist(vin: string, type: ChecklistType) {
    return request<{ items: ChecklistItem[] }>(
      `/vehicles/${encodeURIComponent(vin)}/checklist/${type}`,
    );
  },

  recordChecklist(
    vin: string,
    type: ChecklistType,
    itemId: number,
    body: {
      status: string;
      rework_desc?: string;
      conditional_desc?: string;
      rejected_desc?: string;
    },
  ) {
    return request(
      `/vehicles/${encodeURIComponent(vin)}/checklist/${type}/${itemId}`,
      { method: 'POST', body: JSON.stringify(body) },
    );
  },

  resetEOLWorkflow(vin: string) {
    return request<{
      vin: string;
      current_stage: EOLStage;
      vehicle_status: string;
    }>(`/vehicles/${encodeURIComponent(vin)}/eol/reset`, { method: 'POST' });
  },

  getEOLWorkflow(vin: string) {
    return request<EOLWorkflowView>(
      `/vehicles/${encodeURIComponent(vin)}/eol`,
    );
  },

  eolBranchShip(vin: string) {
    return request<BranchShipResult>(
      `/vehicles/${encodeURIComponent(vin)}/eol/branch-ship`,
      { method: 'POST' },
    );
  },

  eolDepotRelease(vin: string) {
    return request<DepotReleaseResult>(
      `/vehicles/${encodeURIComponent(vin)}/eol/depot-release`,
      { method: 'POST' },
    );
  },

  eolDocumentApprove(vin: string) {
    return request<DocumentApproveResult>(
      `/vehicles/${encodeURIComponent(vin)}/eol/document-approve`,
      { method: 'POST' },
    );
  },

  listIssues(status?: string, vin?: string) {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (vin) params.set('vin', vin);
    const q = params.toString();
    return request<{ items: Issue[] }>(`/issues${q ? `?${q}` : ''}`);
  },

  getIssue(id: number) {
    return request<Issue>(`/issues/${id}`);
  },

  getIssueHistory(id: number) {
    return request<{ items: IssueStatusHistoryEntry[] }>(`/issues/${id}/history`);
  },

  updateIssueStatus(id: number, status: string) {
    return request<{ id: number; status: string }>(`/issues/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  listMedia(entityType: MediaEntityType, entityId: string) {
    const q = new URLSearchParams({
      entity_type: entityType,
      entity_id: entityId,
    });
    return request<{ items: MediaAttachment[] }>(`/media?${q}`);
  },

  listVehicleMedia(vin: string) {
    return request<{ items: MediaAttachment[] }>(
      `/vehicles/${encodeURIComponent(vin)}/media`,
    );
  },

  uploadMedia(entityType: MediaEntityType, entityId: string, file: File) {
    const body = new FormData();
    body.set('entity_type', entityType);
    body.set('entity_id', entityId);
    body.set('file', file);
    return request<MediaAttachment>('/media', { method: 'POST', body });
  },

  updateVehicleStatus(vin: string, status: string) {
    return request<Vehicle>(`/vehicles/${encodeURIComponent(vin)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  dailyPendingIssues(params: AnalysisQuery) {
    return request<{ items: DailyPendingIssue[] }>(
      `/analysis/daily-pending-issues?${toQuery(params)}`,
    );
  },

  vehicleSeverityBreakdown(params: AnalysisQuery) {
    return request<{ items: VehicleSeverityBreakdown[] }>(
      `/analysis/vehicle-severity-breakdown?${toQuery(params)}`,
    );
  },

  defectRatePerStation(params: AnalysisQuery) {
    return request<{ items: StationDefectRate[] }>(
      `/analysis/defect-rate-per-station?${toQuery(params)}`,
    );
  },

  mttr(params: AnalysisQuery) {
    return request<{ items: StationMTTR[] }>(
      `/analysis/mttr?${toQuery(params)}`,
    );
  },

  analysisDashboard(params: AnalysisQuery) {
    return request<AnalysisDashboard>(`/analysis/dashboard?${toQuery(params)}`);
  },

  shipmentReadiness(vin: string) {
    return request<ShipmentReadiness>(
      `/vehicles/${encodeURIComponent(vin)}/shipment-readiness`,
    );
  },
};

export interface ShipmentReadiness {
  vin: string;
  status: string;
  ready: boolean;
  warnings: ShipmentWarning[];
}

export interface ShipmentWarning {
  code: string;
  message: string;
  checklist_type?: string;
  item_id?: number;
  item_status?: string;
  issue_id?: number;
  issue_status?: string;
  remaining_count?: number;
}

export interface Vehicle {
  VIN: string;
  VehicleModelID: number | null;
  CurrentGlobalStatus: string;
  CurrentStationID: number | null;
  TotalProgressPercentage: number;
  EOLTemplateID?: number | null;
  ShipmentTemplateID?: number | null;
  TestTemplateID?: number | null;
  CreatedAt: string;
  UpdatedAt: string;
}

export interface Station {
  ID: number;
  Name: string;
  SequenceNo: number;
  IsActive: boolean;
}

export type ChecklistTemplateType = 'EOL' | 'SHIPMENT' | 'TEST';

export interface ChecklistTemplate {
  ID: number;
  VehicleModelID: number | null;
  Type: ChecklistTemplateType;
  Name: string;
  IsActive: boolean;
  ItemCount: number;
}

export interface ChecklistTemplateItem {
  ID: number;
  TemplateID: number;
  ItemNo: number;
  ItemText: string;
  StationID: number | null;
  EolPhase: 'BRANCH' | 'DEPOT' | null;
  IsActive: boolean;
}

export type ChecklistType = 'eol' | 'shipment' | 'test';

export interface ChecklistItem {
  ItemID: number;
  ItemNo: number;
  ItemText: string;
  Status: string;
  ReworkDesc: string;
  ConditionalDesc: string;
  RejectedDesc: string;
  EolPhase?: 'BRANCH' | 'DEPOT' | null;
  ProgressID?: number | null;
}

export type EOLStage = 'BRANCH' | 'DEPOT' | 'DOCUMENT' | 'COMPLETED';

export interface EOLStageRecord {
  at: string | null;
  by_user_id: number | null;
  by_name?: string;
}

export interface EOLWorkflowView {
  vin: string;
  current_stage: EOLStage;
  branch_ship: EOLStageRecord;
  depot_release: EOLStageRecord;
  document_approve: EOLStageRecord;
  branch_open_issue_count_at_shipment: number | null;
}

export interface BranchShipResult {
  vin: string;
  current_stage: EOLStage;
  vehicle_status: string;
  open_issue_count: number;
  warning?: string;
}

export interface DepotReleaseResult {
  vin: string;
  current_stage: EOLStage;
}

export interface DocumentApproveResult {
  vin: string;
  current_stage: EOLStage;
  vehicle_status: string;
}

export interface Issue {
  ID: number;
  VIN: string;
  SourceType: string;
  StationID: number | null;
  Severity: string;
  Description: string;
  Status: string;
  IssueDate: string;
  IssueReporterID: number;
  ReporterName?: string;
  CreatedAt?: string;
  UpdatedAt?: string;
  ProcessDate?: string | null;
  FinishDate?: string | null;
  ApproveDate?: string | null;
  ConditionalApproveDate?: string | null;
  /** Earliest ISSUE media attachment storage_path, when present. */
  ReportPhotoPath?: string;
}

export interface IssueStatusHistoryEntry {
  ID: number;
  FromStatus: string;
  ToStatus: string;
  ActorName: string;
  EventAt: string;
}

export type MediaEntityType =
  | 'VEHICLE'
  | 'ISSUE'
  | 'ISSUE_RESOLUTION'
  | 'CHECKLIST_ITEM_PROGRESS'
  | 'STATION_STEP_PROGRESS';

export interface MediaAttachment {
  id: number;
  entity_type: MediaEntityType;
  entity_id: string;
  vin: string;
  file_name: string;
  storage_path: string;
  mime_type: string;
  file_size: number;
  uploaded_by: number | null;
  uploaded_at: string;
}

/** Absolute URL for a media_attachments.storage_path served from /uploads/. */
export function mediaFileUrl(storagePath: string): string {
  const origin = API_BASE_URL.replace(/\/api\/v1\/?$/, '');
  const path = storagePath.replace(/^\/+/, '');
  return `${origin}/uploads/${path}`;
}

export function formatIssueCreatedAt(iso?: string): string {
  if (!iso || iso.startsWith('0001')) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export interface AnalysisQuery {
  from?: string;
  to?: string;
  vin_suffix?: string;
  station?: string;
  status?: string;
  issue_type?: string;
}

export interface DailyPendingIssue {
  Day: string;
  PendingCount: number;
}

export interface VehicleSeverityBreakdown {
  VIN: string;
  TotalOpenIssues: number;
  CriticalCount: number;
  MediumCount: number;
  LowCount: number;
}

export interface StationDefectRate {
  StationID: number;
  StationName: string;
  VehiclesWithIssue: number;
  IssueCount: number;
}

export interface StationMTTR {
  StationID: number;
  StationName?: string;
  MeanTimeToResolve: number; // nanoseconds from Go time.Duration JSON
  Hours?: number;
}

export interface AnalysisDashboard {
  KPIs: {
    ShippedToday: number;
    ShippedWeek: number;
    ShippedInRange: number;
    DepotReleasedInRange: number;
    AvgResolutionHours: number | null;
    FirstTimeRightPercent: number | null;
    OpenIssuesInRange: number;
    OnLineCount: number;
  };
  WorkSplit: { Completed: number; Ongoing: number };
  IssueStatus: { Status: string; Count: number }[];
  DefectRate: StationDefectRate[];
  MTTR: StationMTTR[];
  Severity: VehicleSeverityBreakdown[];
  EOLFunnel: { Stage: string; Count: number }[];
  TopIssueTypes: { Name: string; Count: number }[];
  CompletedDaily: { Day: string; CompletedCount: number }[];
}

function toQuery(params: AnalysisQuery): string {
  const q = new URLSearchParams();
  if (params.from) q.set('from', params.from);
  if (params.to) q.set('to', params.to);
  if (params.vin_suffix) q.set('vin_suffix', params.vin_suffix);
  if (params.station) q.set('station', params.station);
  if (params.status) q.set('status', params.status);
  if (params.issue_type) q.set('issue_type', params.issue_type);
  return q.toString();
}

export { API_BASE_URL };
