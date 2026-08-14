/**
 * Single API client for the Karea web dashboard.
 * All pages/components must call through this module — never hardcode the API origin.
 */

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ||
  'http://localhost:8080/api/v1';

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

  listVehicles(params: {
    vin?: string;
    vehicle_number?: string;
    status?: string;
    model?: string;
    station?: string;
    page?: number;
  }) {
    const q = new URLSearchParams();
    if (params.vin) q.set('vin', params.vin);
    if (params.vehicle_number) q.set('vehicle_number', params.vehicle_number);
    if (params.status) q.set('status', params.status);
    if (params.model) q.set('model', params.model);
    if (params.station) q.set('station', params.station);
    if (params.page) q.set('page', String(params.page));
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

  resolveVehicle(vehicleNumber: string) {
    const q = new URLSearchParams({ vehicle_number: vehicleNumber });
    return request<Vehicle>(`/vehicles/resolve?${q}`);
  },

  searchVehicles(vinSuffix: string) {
    const q = new URLSearchParams({ vin_suffix: vinSuffix });
    return request<{ items: Vehicle[] }>(`/vehicles/search?${q}`);
  },

  listStations() {
    return request<{ items: Station[] }>('/stations');
  },

  getVehicleChecklist(vin: string, type: ChecklistType) {
    return request<{ items: ChecklistItem[] }>(
      `/vehicles/${encodeURIComponent(vin)}/checklist/${type}`,
    );
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

  listIssues(status?: string) {
    const q = status ? `?status=${encodeURIComponent(status)}` : '';
    return request<{ items: Issue[] }>(`/issues${q}`);
  },

  getIssue(id: number) {
    return request<Issue>(`/issues/${id}`);
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
};

export interface Vehicle {
  VIN: string;
  VehicleNumber: string;
  VehicleModelID: number;
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
}

export type MediaEntityType =
  | 'VEHICLE'
  | 'ISSUE'
  | 'CHECKLIST_ITEM_PROGRESS'
  | 'STATION_STEP_PROGRESS';

export interface MediaAttachment {
  id: number;
  entity_type: MediaEntityType;
  entity_id: string;
  file_name: string;
  storage_path: string;
  mime_type: string;
  file_size: number;
  uploaded_by: number | null;
  uploaded_at: string;
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
  MeanTimeToResolve: number; // nanoseconds from Go time.Duration JSON
}

function toQuery(params: AnalysisQuery): string {
  const q = new URLSearchParams();
  if (params.from) q.set('from', params.from);
  if (params.to) q.set('to', params.to);
  if (params.vin_suffix) q.set('vin_suffix', params.vin_suffix);
  return q.toString();
}

export { API_BASE_URL };
