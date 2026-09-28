/**
 * Module stubs for rendering real mobile screens with react-native-web.
 * Only data plumbing is stubbed (api, auth, navigation, storage) — every
 * visual component is the real mobile source.
 */
import { useEffect, type ReactNode } from 'react';
import { View } from 'react-native';
import { fixtureIssues, fixtureSteps, fixtureVehicle } from './fixtures.mjs';

declare global {
  interface Window {
    __KAREA_STORE: Record<string, string>;
  }
}

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

// --- react-native-safe-area-context
export function SafeAreaView({ children, style }: { children: ReactNode; style?: unknown }) {
  return <View style={style as never}>{children}</View>;
}

// --- @react-navigation/native
const route = { params: { vin: fixtureVehicle.VIN } };
const navigation = {
  navigate: (name: string, params?: unknown) => {
    (window as unknown as { __nav: unknown[] }).__nav.push({ name, params });
  },
  goBack: () => undefined,
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

// --- ../auth/AuthProvider
// Stable references — screens put these in hook dependency lists.
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
export const api = {
  getVehicle: async () => fixtureVehicle,
  getStationSteps: async () => ({
    Items: fixtureSteps,
    OpenIssuesByStation: { '2': 2, '4': 1 },
  }),
  listIssues: async () => ({ items: fixtureIssues }),
  shipmentReadiness: async () => null,
  getVehicleStatusHistory: async () => ({ items: [] }),
};
export const mediaFileUrl = (p: string) => p;
export const mediaThumbUrl = (p: string) => p;
export const mediaCardThumbUrl = (p: string) => p;
export class ApiError extends Error {}

// --- @react-native/assets-registry/registry (react-native-svg image assets)
export const getAssetByID = () => null;

export default AsyncStorage;
