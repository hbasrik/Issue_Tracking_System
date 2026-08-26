/**
 * Color tokens — Design system v3 (shared with web).
 * Surfaces follow docs/07; brand accent is Satsuma.
 */

export type ThemeMode = 'dark' | 'light';

/** AsyncStorage key — only written after an explicit user choice. */
export const THEME_STORAGE_KEY = 'karea-theme-mode';

export function parseThemeMode(raw: string | null | undefined): ThemeMode | null {
  if (raw === 'dark' || raw === 'light') return raw;
  return null;
}

let currentMode: ThemeMode = 'light';

export function bindThemeMode(mode: ThemeMode): void {
  currentMode = mode;
}

/**
 * Lighten an existing token toward white. Declared before surface/status
 * tokens so Metro/Hermes does not hit a TDZ ReferenceError at import.
 */
export function mixTowardWhite(hex: string, whitePct: number): string {
  const h = hex.replace('#', '');
  const r = Number.parseInt(h.slice(0, 2), 16);
  const g = Number.parseInt(h.slice(2, 4), 16);
  const b = Number.parseInt(h.slice(4, 6), 16);
  const t = Math.min(100, Math.max(0, whitePct)) / 100;
  return `rgb(${Math.round(r + (255 - r) * t)}, ${Math.round(g + (255 - g) * t)}, ${Math.round(b + (255 - b) * t)})`;
}

/** Darken an existing token toward black — light-theme contrast, no new hex. */
export function mixTowardBlack(hex: string, blackPct: number): string {
  const h = hex.replace('#', '');
  const r = Number.parseInt(h.slice(0, 2), 16);
  const g = Number.parseInt(h.slice(2, 4), 16);
  const b = Number.parseInt(h.slice(4, 6), 16);
  const t = Math.min(100, Math.max(0, blackPct)) / 100;
  return `rgb(${Math.round(r * (1 - t))}, ${Math.round(g * (1 - t))}, ${Math.round(b * (1 - t))})`;
}

/** Brand & neutral palette (theme-invariant). */
export const brandColors = {
  /** Primary / Satsuma — buttons, active nav, focus */
  primary: '#FF3B1E',
  secondary: '#327CB2',
  neutralWarm: '#C0A89B',
  neutralOlive: '#8E9E7C',
  neutralGray: '#B5B2B2',
  critical: '#C62222',
} as const;

/**
 * 4px spacing scale. Prefer these over ad-hoc margins so web and mobile
 * share the same rhythm.
 */
export const space = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
} as const;

/**
 * Sidebar / drawer chrome. White on raw Satsuma (#FF3B1E) is ~3.56:1 —
 * short of WCAG AA (4.5:1) at 15px. Darken 16% toward black (~4.57:1)
 * without introducing a new palette hex.
 */
export const sidebarTokens = {
  bg: mixTowardBlack(brandColors.primary, 16),
  text: mixTowardWhite(brandColors.primary, 100),
} as const;

export const darkTokens = {
  bgPage: '#0B0F14',
  bgSurface1: '#131920',
  bgSurface2: '#1B232C',
  border: '#26313C',
  textPrimary: '#F5F7FA',
  textSecondary: '#8B98A5',
  accent: brandColors.primary,
} as const;

const lightInk = '#101418';

export const lightTokens = {
  bgPage: '#F7F9FB',
  bgSurface1: '#FFFFFF',
  bgSurface2: '#F1F5F9',
  border: mixTowardWhite(lightInk, 72),
  textPrimary: lightInk,
  textSecondary: '#5B6672',
  accent: brandColors.primary,
};

const statusColorBase = {
  ok: '#22C55E',
  notOk: brandColors.critical,
  rework: '#8B5CF6',
  conditionalOk: '#F59E0B',
  info: brandColors.secondary,
  pending: brandColors.neutralGray,
  severityCritical: brandColors.critical,
  severityMedium: '#EAB308',
  severityLow: brandColors.secondary,
  issueOpen: brandColors.critical,
  /** İşlemde — existing amber (not blue, not Satsuma). */
  issueInProgress: '#F59E0B',
  /** Tamamlandı — brand secondary blue, distinct from İşlemde amber. */
  issueDone: brandColors.secondary,
  /** Kalite Onay — full green (same swatch as `ok`). */
  issueResolved: '#22C55E',
};

export const statusColors = {
  ...statusColorBase,
  get severityEmpty() {
    return currentMode === 'light'
      ? mixTowardWhite(lightInk, 58)
      : brandColors.neutralGray;
  },
  /** Şartlı Onay — opened toward white on dark, toward black on light. */
  get issueConditionalApproved() {
    return currentMode === 'light'
      ? mixTowardBlack(statusColorBase.ok, 22)
      : mixTowardWhite(statusColorBase.ok, 42);
  },
};

export type ThemeTokens = {
  bgPage: string;
  bgSurface1: string;
  bgSurface2: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  accent: string;
};

export function tokensFor(mode: ThemeMode): ThemeTokens {
  return mode === 'dark' ? darkTokens : lightTokens;
}
