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

/** Wire the auth token source (called once from AuthProvider). */
export function setTokenGetter(fn: TokenGetter): void {
  getToken = fn;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
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

export const api = {
  login(email: string, password: string) {
    return request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  listVehicles(params: {
    vin?: string;
    status?: string;
    model?: string;
    page?: number;
  }) {
    const q = new URLSearchParams();
    if (params.vin) q.set('vin', params.vin);
    if (params.status) q.set('status', params.status);
    if (params.model) q.set('model', params.model);
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

  searchVehicles(vinSuffix: string) {
    const q = new URLSearchParams({ vin_suffix: vinSuffix });
    return request<{ items: Vehicle[] }>(`/vehicles/search?${q}`);
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
  VehicleModelID: number;
  CurrentGlobalStatus: string;
  CurrentPhase: number;
  TotalProgressPercentage: number;
  EOLTemplateID?: number | null;
  ShipmentTemplateID?: number | null;
  CreatedAt: string;
  UpdatedAt: string;
}

export interface AnalysisQuery {
  from?: string;
  to?: string;
  vin_suffix?: string;
  phase?: string;
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
