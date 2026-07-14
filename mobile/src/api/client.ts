/**
 * Single API client for the Karea operator mobile app.
 * All screens must call through this module — never hardcode the API origin.
 */

const API_BASE_URL =
  (process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:8080/api/v1').replace(
    /\/$/,
    '',
  );

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

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && options.body) {
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

export interface Vehicle {
  VIN: string;
  VehicleModelID: number;
  CurrentGlobalStatus: string;
  CurrentPhase: number;
  TotalProgressPercentage: number;
  EOLTemplateID?: number | null;
  ShipmentTemplateID?: number | null;
  CreatedAt?: string;
  UpdatedAt?: string;
}

export interface CheckpointItem {
  ID: number;
  PhaseNumber: number;
  SequenceNo: number;
  Name: string;
  StationID?: number | null;
  Status: 'PENDING' | 'OK' | 'NOT_OK';
  RelatedIssueID?: number | null;
}

export interface ChecklistItem {
  ItemID: number;
  ItemNo: number;
  ItemText: string;
  Status: 'PENDING' | 'OK' | 'NOT_OK' | 'REWORK' | 'CONDITIONAL_OK';
  ReworkDesc?: string;
  ConditionalDesc?: string;
  RejectedDesc?: string;
}

export interface Issue {
  ID: number;
  VIN: string;
  SourceType: string;
  SourceCheckpointID?: number | null;
  SourceCheckItemID?: number | null;
  StationID?: number | null;
  Severity: 'CRITICAL' | 'MEDIUM' | 'LOW';
  Description: string;
  PictureURL?: string;
  Status: 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'APPROVED';
  IssueReporterID: number;
  IssueDate?: string;
  CreatedAt?: string;
  UpdatedAt?: string;
}

export interface Station {
  ID: number;
  Name: string;
  PhaseNumber: number | null;
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

  listVehicles(params: { phase?: number; page?: number } = {}) {
    const q = new URLSearchParams();
    if (params.phase) q.set('phase', String(params.phase));
    if (params.page) q.set('page', String(params.page));
    const qs = q.toString();
    return request<{ Items: Vehicle[]; Total: number; Page: number; Size: number }>(
      `/vehicles${qs ? `?${qs}` : ''}`,
    );
  },

  getVehicle(vin: string) {
    return request<Vehicle>(`/vehicles/${encodeURIComponent(vin)}`);
  },

  getCheckpoints(vin: string) {
    return request<{
      Items: CheckpointItem[];
      OpenIssuesByPhase: Record<string, number>;
    }>(`/vehicles/${encodeURIComponent(vin)}/checkpoints`);
  },

  recordCheckpoint(vin: string, checkpointId: number, status: 'OK' | 'NOT_OK') {
    return request(`/vehicles/${encodeURIComponent(vin)}/checkpoints/${checkpointId}`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    });
  },

  getChecklist(vin: string, type: 'eol' | 'shipment') {
    return request<{ items: ChecklistItem[] }>(
      `/vehicles/${encodeURIComponent(vin)}/checklist/${type}`,
    );
  },

  recordChecklist(
    vin: string,
    type: 'eol' | 'shipment',
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
    source_checkpoint_id?: number;
    source_check_item_id?: number;
    station_id?: number;
    severity: string;
    description: string;
    picture_url?: string;
  }) {
    return request<Issue>('/issues', {
      method: 'POST',
      body: JSON.stringify(body),
    });
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

  listStations() {
    return request<{ items: Station[] }>('/stations');
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
