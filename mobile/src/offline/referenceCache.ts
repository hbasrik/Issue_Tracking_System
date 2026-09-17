import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  api,
  type DefectPart,
  type DefectType,
  type DefectZone,
  type IssueType,
  type Station,
  type Vehicle,
} from '../api/client';
import { isTransportError } from '../../../shared/networkError';
import { searchCachedVin } from '../../../shared/searchCachedVin';
import type { Translate } from '../../../shared/i18n';

const STORAGE_KEY = 'karea.referenceCache.v1';

/** Refresh from the network when the snapshot is older than this and we are online. */
export const REFERENCE_REFRESH_MS = 15 * 60 * 1000;

/**
 * 500 vehicles × ~0.5 KB JSON ≈ 250 KB, plus catalogue/stations (<50 KB).
 * Well under AsyncStorage's typical 6 MB cap — not a storage problem.
 */
export type ReferenceSnapshot = {
  fetchedAt: string;
  vehicles: Vehicle[];
  zones: DefectZone[];
  parts: DefectPart[];
  types: DefectType[];
  stations: Station[];
  issueTypes: IssueType[];
};

export const EMPTY_SNAPSHOT: ReferenceSnapshot = {
  fetchedAt: '',
  vehicles: [],
  zones: [],
  parts: [],
  types: [],
  stations: [],
  issueTypes: [],
};

export async function loadReferenceSnapshot(): Promise<ReferenceSnapshot | null> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ReferenceSnapshot;
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.vehicles)) {
      return null;
    }
    return {
      fetchedAt: parsed.fetchedAt ?? '',
      vehicles: parsed.vehicles ?? [],
      zones: parsed.zones ?? [],
      parts: parsed.parts ?? [],
      types: parsed.types ?? [],
      stations: parsed.stations ?? [],
      issueTypes: parsed.issueTypes ?? [],
    };
  } catch {
    return null;
  }
}

async function saveReferenceSnapshot(snap: ReferenceSnapshot): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
}

async function listAllVehicles(): Promise<Vehicle[]> {
  const pageSize = 100;
  const first = await api.listVehicles({ page: 1, size: pageSize });
  const items = [...(first.Items ?? [])];
  const total = first.Total ?? items.length;
  const size = first.Size || pageSize;
  const pages = Math.min(20, Math.max(1, Math.ceil(total / size)));
  for (let page = 2; page <= pages; page += 1) {
    const next = await api.listVehicles({ page, size: pageSize });
    items.push(...(next.Items ?? []));
  }
  return items;
}

export async function fetchReferenceSnapshot(): Promise<ReferenceSnapshot> {
  const [vehicles, zones, parts, types, stations, issueTypes] = await Promise.all([
    listAllVehicles(),
    api.listDefectCatalogZones(),
    api.listDefectCatalogParts(),
    api.listDefectCatalogTypes(),
    api.listStations(),
    api.listIssueTypes(),
  ]);
  const snap: ReferenceSnapshot = {
    fetchedAt: new Date().toISOString(),
    vehicles,
    zones: zones.items ?? [],
    parts: parts.items ?? [],
    types: types.items ?? [],
    stations: (stations.items ?? [])
      .slice()
      .sort((a, b) => a.SequenceNo - b.SequenceNo),
    issueTypes: issueTypes.items ?? [],
  };
  await saveReferenceSnapshot(snap);
  return snap;
}

export async function refreshReferenceSnapshot(
  current: ReferenceSnapshot | null,
): Promise<{ snap: ReferenceSnapshot; fromCache: boolean }> {
  try {
    const snap = await fetchReferenceSnapshot();
    return { snap, fromCache: false };
  } catch (err) {
    if (current && (isTransportError(err) || current.vehicles.length > 0)) {
      return { snap: current, fromCache: true };
    }
    if (isTransportError(err)) {
      const disk = await loadReferenceSnapshot();
      if (disk) return { snap: disk, fromCache: true };
    }
    throw err;
  }
}

export function searchCachedVehicles(
  vehicles: Vehicle[],
  query: string,
  limit = 10,
): Vehicle[] {
  return searchCachedVin(vehicles, query, limit);
}

export function snapshotIsStale(fetchedAt: string, nowMs: number): boolean {
  const t = Date.parse(fetchedAt);
  if (Number.isNaN(t)) return true;
  return nowMs - t >= REFERENCE_REFRESH_MS;
}

export function formatCacheAge(
  fetchedAt: string,
  nowMs: number,
  t: Translate,
): string {
  const then = Date.parse(fetchedAt);
  if (!fetchedAt || Number.isNaN(then)) return t('offline.noCache');
  const delta = Math.max(0, nowMs - then);
  if (delta < 60_000) return t('offline.justNow');
  if (delta < 3_600_000) {
    return t('offline.minutes', { n: Math.floor(delta / 60_000) });
  }
  if (delta < 86_400_000) {
    return t('offline.hours', { n: Math.floor(delta / 3_600_000) });
  }
  return t('offline.days', { n: Math.floor(delta / 86_400_000) });
}
