/**
 * Color tokens from docs/07_KAREA_UIUX_Tasarim_Rehberi.md Section 1.1 + Section 5.
 * Dark mode is the default.
 */

export type ThemeMode = 'dark' | 'light';

export const darkTokens = {
  'bg-page': '#0B0F14',
  'bg-surface-1': '#131920',
  'bg-surface-2': '#1B232C',
  border: '#26313C',
  'text-primary': '#F5F7FA',
  'text-secondary': '#8B98A5',
  accent: '#2F8FFF',
} as const;

export const lightTokens = {
  'bg-page': '#F7F9FB',
  'bg-surface-1': '#FFFFFF',
  'bg-surface-2': '#F1F5F9',
  border: '#E2E8F0',
  'text-primary': '#101418',
  'text-secondary': '#5B6672',
  accent: '#1D6FE0',
} as const;

/** Semantic status colors (fixed across themes, Section 1.1 + Section 5). */
export const statusColors = {
  ok: '#22C55E',
  notOk: '#EF4444',
  rework: '#8B5CF6',
  conditionalOk: '#F59E0B',
  info: '#38BDF8',
  pending: '#8B98A5',
  /** Issue severity — Section 5 */
  severityCritical: '#791F1F',
  severityMedium: '#F59E0B',
  severityLow: '#38BDF8',
  /** Vehicle status — Section 5 */
  vehicleInProduction: '#2F8FFF',
  vehicleInWarehouse: '#8B98A5',
  vehicleWithCustomer: '#F59E0B',
  vehicleShipped: '#22C55E',
  vehicleOnHold: '#EF4444',
  /** Issue status — Section 5 (OPEN/IN_PROGRESS/RESOLVED; DONE+APPROVED map to resolved) */
  issueOpen: '#EF4444',
  issueInProgress: '#F59E0B',
  issueResolved: '#22C55E',
} as const;

export function tokensFor(mode: ThemeMode) {
  return mode === 'dark' ? darkTokens : lightTokens;
}

/** Apply CSS custom properties to :root for the active theme. */
export function applyThemeVars(mode: ThemeMode): void {
  const tokens = tokensFor(mode);
  const root = document.documentElement;
  root.dataset.theme = mode;
  for (const [key, value] of Object.entries(tokens)) {
    root.style.setProperty(`--${key}`, value);
  }
  // Status colors are theme-invariant.
  for (const [key, value] of Object.entries(statusColors)) {
    root.style.setProperty(`--status-${kebab(key)}`, value);
  }
}

function kebab(s: string): string {
  return s.replace(/([A-Z])/g, '-$1').toLowerCase();
}
