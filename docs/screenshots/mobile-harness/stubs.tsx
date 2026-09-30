/**
 * Data-plumbing stubs (api, auth, navigation, storage) for rendering real
 * mobile screens with react-native-web. Responses come from the active
 * scene (scenes.ts); writes are recorded on window.__calls and change nothing.
 */
import { useEffect, type ReactNode } from 'react';
import { View } from 'react-native';
import { activeScene } from './scenes';

declare global {
  interface Window {
    __KAREA_STORE: Record<string, string>;
    __nav: unknown[];
    __calls: unknown[];
  }
}

const scene = activeScene();

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
const auth = { has: () => true, token: null, user: null };
export function useAuth() {
  return auth;
}

// --- ../offline/ReferenceCacheProvider
const cache = { snapshot: { vehicles: [] } };
export function useReferenceCache() {
  return cache;
}

// --- ../api/client
const record = (name: string) => async (...args: unknown[]) => {
  window.__calls.push({ name, args });
  return {};
};
export const api = {
  getVehicle: async () => scene.api.vehicle,
  getStationSteps: async () => scene.api.stationSteps ?? { Items: [], OpenIssuesByStation: {} },
  listIssues: async () => ({ items: scene.api.issues ?? [], has_more: false }),
  listIssueTypes: async () => ({ items: [] }),
  listDefectCatalogZones: async () => ({ items: [] }),
  listDefectCatalogParts: async () => ({ items: [] }),
  listDefectCatalogTypes: async () => ({ items: [] }),
  shipmentReadiness: async () => scene.api.readiness ?? null,
  getVehicleStatusHistory: async () => ({ items: [] }),
  getChecklist: async (_vin: string, type: 'eol' | 'shipment' | 'test') => ({
    items: scene.api.checklists?.[type] ?? [],
  }),
  getEOLWorkflow: async () => scene.api.eolWorkflow,
  getIssue: async () => scene.api.issue,
  getIssueHistory: async () => ({ items: scene.api.issueHistory ?? [] }),
  listMedia: async () => ({ items: [] }),
  updateIssueStatus: record('updateIssueStatus'),
  updateIssueClassification: record('updateIssueClassification'),
  uploadMedia: record('uploadMedia'),
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
export class ApiError extends Error {}

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

// --- expo-image-picker, ../lib/prepareUploadImage (no picking in the harness)
export const requestMediaLibraryPermissionsAsync = async () => ({ granted: false });
export const requestCameraPermissionsAsync = async () => ({ granted: false });
export const launchImageLibraryAsync = async () => ({ canceled: true, assets: [] });
export const launchCameraAsync = async () => ({ canceled: true, assets: [] });
export const MediaTypeOptions = { Images: 'Images' };
export const prepareUploadImage = async (f: unknown) => f;

// --- @react-native/assets-registry/registry (react-native-svg image assets)
export const getAssetByID = () => null;
