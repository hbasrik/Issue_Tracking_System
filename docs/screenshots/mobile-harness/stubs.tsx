/**
 * Data-plumbing stubs (api, auth, navigation, storage) for rendering real
 * mobile screens with react-native-web. Responses come from the active
 * scene (scenes.ts); writes are recorded on window.__calls and change nothing.
 */
import { useEffect, type ReactNode } from 'react';
import { View } from 'react-native';
import { activeScene } from './scenes';
import * as RealReferenceCache from '../../../mobile/src/offline/ReferenceCacheProvider';

declare global {
  interface Window {
    __KAREA_STORE: Record<string, string>;
    __nav: unknown[];
    __calls: unknown[];
  }
}

const scene = activeScene();
const live = scene.live;

// --- @react-native-async-storage/async-storage
export const AsyncStorage = {
  getItem: async (k: string) => window.__KAREA_STORE?.[k] ?? null,
  setItem: async (k: string, v: string) => {
    window.__KAREA_STORE[k] = v;
  },
  removeItem: async (k: string) => {
    delete window.__KAREA_STORE[k];
  },
};
export default AsyncStorage;

// --- react-native-safe-area-context
export function SafeAreaView({ children, style }: { children: ReactNode; style?: unknown }) {
  return <View style={style as never}>{children}</View>;
}
export function useSafeAreaInsets() {
  return { top: 0, bottom: 0, left: 0, right: 0 };
}

// --- @react-navigation/native
const route = { params: scene.params };
const navigation = {
  navigate: (name: string, params?: unknown) => window.__nav.push({ name, params }),
  goBack: () => undefined,
  setOptions: () => undefined,
};
export function useRoute() {
  return route;
}
export function useNavigation() {
  return navigation;
}
export function useFocusEffect(cb: () => void) {
  useEffect(() => cb(), [cb]);
}

// --- ../auth/AuthProvider (stable references: screens use them in deps)
const auth = live
  ? { has: () => true, token: 'harness', user: { ID: live.userId }, isAuthenticated: true }
  : { has: () => true, token: null, user: null, isAuthenticated: false };
export function useAuth() {
  return auth;
}

// --- ../offline/ReferenceCacheProvider (live scenes run the real provider)
const emptySnapshot = { fetchedAt: '', vehicles: [], zones: [], parts: [], types: [], stations: [], issueTypes: [] };
const cache = {
  snapshot: emptySnapshot,
  ready: true,
  fromCache: false,
  cacheAgeLabel: null,
  catalogAgeLabel: null,
  refreshing: false,
  searchVehicles: () => [],
  refresh: async () => undefined,
};
function PassThrough({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
export const ReferenceCacheProvider = live ? RealReferenceCache.ReferenceCacheProvider : PassThrough;
export const FOREGROUND_CHECK_MS = RealReferenceCache.FOREGROUND_CHECK_MS;
export const useReferenceCache = live
  ? RealReferenceCache.useReferenceCache
  : function useReferenceCache() {
      return cache;
    };

// --- expo-file-system/legacy (queued photos stay where the scene put them)
export const documentDirectory = 'file:///harness/';
export const makeDirectoryAsync = async () => undefined;
export const copyAsync = async () => undefined;
export const getInfoAsync = async () => ({ exists: true, size: 1 });
export const deleteAsync = async (uri: string) => {
  window.__calls.push({ name: 'deleteAsync', args: [uri.slice(0, 40)] });
};

// --- ../api/client
const record = (name: string) => async (...args: unknown[]) => {
  window.__calls.push({ name, args });
  return {};
};
let catalogFetches = 0;
const catalogue = (key: 'zones' | 'parts' | 'types') => async () => {
  if (!live) return { items: [] };
  if (key === 'parts') catalogFetches += 1;
  window.__calls.push({ name: `listDefectCatalog_${key}`, args: [], at: Date.now() });
  const source = catalogFetches > 1 && live.catalogAfter ? live.catalogAfter : live.catalog;
  return { items: source[key] };
};
export class ApiError extends Error {
  status: number;
  body: { error?: string };
  constructor(status: number, body: { error?: string }) {
    super(body.error || `HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}
export const api = {
  listVehicles: async () => ({ Items: [], Total: 0, Size: 100 }),
  listStations: async () => ({ items: [] }),
  createIssue: async (payload: { defect_part_id: number }, opts?: unknown) => {
    window.__calls.push({ name: 'createIssue', args: [payload, opts] });
    if (live?.rejectPartIds?.includes(payload.defect_part_id)) {
      throw new ApiError(400, { error: 'selected catalogue item is inactive' });
    }
    return { ID: 501 };
  },
  getVehicle: async () => scene.api.vehicle,
  getStationSteps: async () => scene.api.stationSteps ?? { Items: [], OpenIssuesByStation: {} },
  listIssues: async () => ({ items: scene.api.issues ?? [], has_more: false }),
  listIssueTypes: async () => ({ items: [] }),
  listDefectCatalogZones: catalogue('zones'),
  listDefectCatalogParts: catalogue('parts'),
  listDefectCatalogTypes: catalogue('types'),
  shipmentReadiness: async () => scene.api.readiness ?? null,
  getVehicleStatusHistory: async () => ({ items: [] }),
  getVehicleTimeline: async () => scene.api.timeline ?? { items: [], truncated: false },
  getChecklist: async (_vin: string, type: 'eol' | 'shipment' | 'test') => ({
    items: scene.api.checklists?.[type] ?? [],
  }),
  getEOLWorkflow: async () => scene.api.eolWorkflow,
  getIssue: async () => scene.api.issue,
  getIssueHistory: async () => ({ items: scene.api.issueHistory ?? [] }),
  listMedia: async () => ({ items: [] }),
  updateIssueStatus: record('updateIssueStatus'),
  updateIssueClassification: record('updateIssueClassification'),
  uploadMedia: async (...args: unknown[]) => {
    window.__calls.push({ name: 'uploadMedia', args });
    if (scene.harness?.uploadError) throw new TypeError(scene.harness.uploadError);
    return {};
  },
  recordChecklist: record('recordChecklist'),
  recordStationStep: record('recordStationStep'),
  placeOnHold: record('placeOnHold'),
  releaseFromHold: record('releaseFromHold'),
  eolBranchShip: record('eolBranchShip'),
  eolDepotRelease: record('eolDepotRelease'),
  eolDeliver: record('eolDeliver'),
};
export const mediaFileUrl = (p: string) => p;
export const mediaThumbUrl = (p: string) => p;
export const mediaCardThumbUrl = (p: string) => p;

// --- ../lib/criticalAlertSound (expo-audio has no web build here)
export const playCriticalAlertIfEnabled = async () => false;

// --- ../components/ConfirmDialog, ../components/ApprovalUndoToast
const confirm = async () => false;
export function useConfirm() {
  return confirm;
}
const undo = { showAfterApproval: () => undefined };
export function useApprovalUndo() {
  return undo;
}

// --- expo-image-picker, ../lib/prepareUploadImage (picks only when the scene asks)
const pick = Boolean(scene.harness?.pickPhoto);
export const requestMediaLibraryPermissionsAsync = async () => ({ granted: pick });
export const requestCameraPermissionsAsync = async () => ({ granted: false });
export const launchImageLibraryAsync = async () =>
  pick
    ? { canceled: false, assets: [{ uri: 'file:///harness/eol.jpg', fileName: 'eol-akü.jpg', width: 1600, height: 1200 }] }
    : { canceled: true, assets: [] };
export const launchCameraAsync = async () => ({ canceled: true, assets: [] });
export const MediaTypeOptions = { Images: 'Images' };
export const prepareUploadImage = async (a: { uri: string; fileName?: string }) => ({
  uri: a.uri,
  name: (a.fileName ?? 'photo').replace(/\.[^.]+$/, '') + '.jpg',
  type: 'image/jpeg',
});

// --- @react-native/assets-registry/registry (react-native-svg image assets)
export const getAssetByID = () => null;
