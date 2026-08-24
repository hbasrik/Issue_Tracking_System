/**
 * Single API client for the Karea operator mobile app.
 * All screens must call through this module — never hardcode the API origin.
 */

const API_BASE_URL =
  (process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:8080/api/v1').replace(
    /\/$/,
    '',
  );

if (__DEV__) {
  console.info('[karea] API_BASE_URL', API_BASE_URL);
}

export type UserRole = 'OPERATOR' | 'MANAGER_ADMIN';

export interface User {
  ID: number;
  FullName: string;
  Email: string;
  Role: UserRole;
  IsActive: boolean;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface ApiErrorBody {
  error: string;
  blocking_item_ids?: number[];
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

export function setTokenGetter(fn: TokenGetter): void {
  getToken = fn;
}

const REQUEST_TIMEOUT_MS = 15_000;

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  // A multipart body has to keep the boundary fetch generates for it, so only
  // JSON bodies get an explicit content type.
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

  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), REQUEST_TIMEOUT_MS);
  if (options.signal) {
    if (options.signal.aborted) timeout.abort();
    else {
      options.signal.addEventListener('abort', () => timeout.abort(), {
        once: true,
      });
    }
  }

  if (__DEV__) {
    console.info('[karea] api', options.method ?? 'GET', path);
  }

  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
      signal: timeout.signal,
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
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ApiError(0, { error: `request timed out: ${path}` });
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
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
  CreatedAt?: string;
  UpdatedAt?: string;
}

export interface StationStepItem {
  ID: number;
  StationID: number;
  StationName: string;
  SequenceNo: number;
  Name: string;
  Status: 'PENDING' | 'OK' | 'NOT_OK';
  RelatedIssueID?: number | null;
}

export type ChecklistType = 'eol' | 'shipment' | 'test';

/** Which EoL stage an item belongs to (Karar 2). Null for shipment and test. */
export type EOLItemPhase = 'BRANCH' | 'DEPOT';

export interface ChecklistItem {
  ItemID: number;
  ItemNo: number;
  ItemText: string;
  Status: 'PENDING' | 'OK' | 'NOT_OK' | 'REWORK' | 'CONDITIONAL_OK';
  ReworkDesc?: string;
  ConditionalDesc?: string;
  RejectedDesc?: string;
  EolPhase?: EOLItemPhase | null;
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

export interface Issue {
  ID: number;
  VIN: string;
  SourceType: string;
  SourceStationStepID?: number | null;
  SourceCheckItemID?: number | null;
  StationID?: number | null;
  Severity: 'CRITICAL' | 'MEDIUM' | 'LOW';
  Description: string;
  PictureURL?: string;
  Status:
    | 'OPEN'
    | 'IN_PROGRESS'
    | 'DONE'
    | 'APPROVED'
    | 'CONDITIONAL_APPROVED';
  IssueReporterID: number;
  IssueDate?: string;
  CreatedAt?: string;
  UpdatedAt?: string;
  SolutionDescription?: string;
  ReporterName?: string;
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

export interface Station {
  ID: number;
  Name: string;
  SequenceNo: number;
  IsActive: boolean;
}

export interface IssueType {
  ID: number;
  Name: string;
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

/** A photo picked on the device, in the shape React Native's fetch uploads. */
export interface LocalFile {
  uri: string;
  name: string;
  type: string;
}

export const api = {
  login(email: string, password: string) {
    return request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  searchVehicles(vinSuffix: string) {
    const q = new URLSearchParams({ vin_suffix: vinSuffix });
    return request<{ items: Vehicle[] }>(`/vehicles/search?${q}`);
  },

  listVehicles(params: { station?: number; page?: number; status?: string; vin?: string } = {}) {
    const q = new URLSearchParams();
    if (params.station) q.set('station', String(params.station));
    if (params.page) q.set('page', String(params.page));
    if (params.status) q.set('status', params.status);
    if (params.vin) q.set('vin', params.vin);
    const qs = q.toString();
    return request<{ Items: Vehicle[]; Total: number; Page: number; Size: number }>(
      `/vehicles${qs ? `?${qs}` : ''}`,
    );
  },

  getVehicle(vin: string) {
    return request<Vehicle>(`/vehicles/${encodeURIComponent(vin)}`);
  },

  getStationSteps(vin: string) {
    return request<{
      Items: StationStepItem[];
      OpenIssuesByStation: Record<string, number>;
    }>(`/vehicles/${encodeURIComponent(vin)}/station-steps`);
  },

  recordStationStep(vin: string, stationStepId: number, status: 'OK' | 'NOT_OK') {
    return request(
      `/vehicles/${encodeURIComponent(vin)}/station-steps/${stationStepId}`,
      {
        method: 'POST',
        body: JSON.stringify({ status }),
      },
    );
  },

  getChecklist(vin: string, type: ChecklistType) {
    return request<{ items: ChecklistItem[] }>(
      `/vehicles/${encodeURIComponent(vin)}/checklist/${type}`,
    );
  },

  /**
   * Current EoL stage plus each stage's timestamp and actor. Read-only for
   * operators: the stage actions themselves are Manager/Admin-only and live on
   * the web dashboard (Karar 2).
   */
  getEOLWorkflow(vin: string) {
    return request<EOLWorkflowView>(`/vehicles/${encodeURIComponent(vin)}/eol`);
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
      request_gate_exit?: boolean;
    },
  ) {
    return request(
      `/vehicles/${encodeURIComponent(vin)}/checklist/${type}/${itemId}`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    );
  },

  createIssue(body: {
    vin: string;
    source_type: string;
    source_station_step_id?: number;
    source_check_item_id?: number;
    station_id?: number;
    issue_type_id?: number;
    severity: string;
    description: string;
    picture_url?: string;
  }) {
    return request<Issue>('/issues', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  listIssueTypes() {
    return request<{ items: IssueType[] }>('/issue-types');
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

  updateIssueStatus(id: number, status: string, solutionDescription?: string) {
    const body: { status: string; solution_description?: string } = { status };
    if (solutionDescription != null) {
      body.solution_description = solutionDescription;
    }
    return request<{ id: number; status: string }>(`/issues/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },

  listStations() {
    return request<{ items: Station[] }>('/stations');
  },

  listMedia(entityType: MediaEntityType, entityId: string) {
    const q = new URLSearchParams({
      entity_type: entityType,
      entity_id: entityId,
    });
    return request<{ items: MediaAttachment[] }>(`/media?${q}`);
  },

  /**
   * Attaches a photo to an existing entity (Karar 8). The entity has to exist
   * already — for an issue that means uploading after the issue is created.
   */
  uploadMedia(entityType: MediaEntityType, entityId: string, file: LocalFile) {
    const body = new FormData();
    body.append('entity_type', entityType);
    body.append('entity_id', entityId);
    // React Native's fetch accepts this file descriptor where the DOM would
    // require a Blob.
    body.append('file', file as unknown as Blob);
    return request<MediaAttachment>('/media', { method: 'POST', body });
  },

  /** Current-state open-issue severity by VIN (Decision Log #9; no filters). */
  vehicleSeverityBreakdown() {
    return request<{ items: VehicleSeverityBreakdown[] }>(
      '/analysis/vehicle-severity-breakdown',
    );
  },

  /** Current-state open issue counts per station (Decision Log #9; no filters). */
  defectRatePerStation() {
    return request<{ items: StationDefectRate[] }>(
      '/analysis/defect-rate-per-station',
    );
  },
};

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

export { API_BASE_URL };

/** Absolute URL for a media_attachments.storage_path served from /uploads/. */
export function mediaFileUrl(storagePath: string): string {
  const origin = API_BASE_URL.replace(/\/api\/v1\/?$/, '');
  const path = storagePath.replace(/^\/+/, '');
  return `${origin}/uploads/${path}`;
}
