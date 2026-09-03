import type { User } from '../lib/api';

const STORAGE_KEY = 'karea.auth.session';

export type PersistedAuth = {
  token: string;
  user: User;
  permissions: string[];
};

export function loadPersistedAuth(): PersistedAuth | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedAuth;
    if (
      typeof parsed.token !== 'string' ||
      !parsed.user ||
      (typeof parsed.user.ID !== 'number' && typeof parsed.user.ID !== 'string') ||
      !Array.isArray(parsed.permissions)
    ) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function savePersistedAuth(data: PersistedAuth): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function clearPersistedAuth(): void {
  localStorage.removeItem(STORAGE_KEY);
}
