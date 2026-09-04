import * as SecureStore from 'expo-secure-store';
import type { User } from '../api/client';

const STORAGE_KEY = 'karea.auth.session';

export type PersistedAuth = {
  token: string;
  user: User;
  permissions: string[];
};

/** Decode JWT payload without verifying signature — used only for client-side expiry. */
export function isJwtExpired(token: string, nowSec = Math.floor(Date.now() / 1000)): boolean {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return true;
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = payload.length % 4 === 0 ? '' : '='.repeat(4 - (payload.length % 4));
    const json = globalThis.atob(payload + pad);
    const claims = JSON.parse(json) as { exp?: number };
    if (typeof claims.exp !== 'number') return true;
    return nowSec >= claims.exp;
  } catch {
    return true;
  }
}

function isValidSession(parsed: unknown): parsed is PersistedAuth {
  if (!parsed || typeof parsed !== 'object') return false;
  const p = parsed as PersistedAuth;
  const id = p.user?.ID;
  return (
    typeof p.token === 'string' &&
    p.token.length > 0 &&
    !!p.user &&
    (typeof id === 'number' || typeof id === 'string') &&
    Array.isArray(p.permissions)
  );
}

export async function loadPersistedAuth(): Promise<PersistedAuth | null> {
  try {
    const raw = await SecureStore.getItemAsync(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isValidSession(parsed)) {
      await clearPersistedAuth();
      return null;
    }
    if (isJwtExpired(parsed.token)) {
      await clearPersistedAuth();
      return null;
    }
    return parsed;
  } catch {
    await clearPersistedAuth();
    return null;
  }
}

export async function savePersistedAuth(data: PersistedAuth): Promise<void> {
  await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(data));
}

export async function clearPersistedAuth(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(STORAGE_KEY);
  } catch {
    // ignore — store may already be empty
  }
}
