/**
 * Color tokens — Design system v3 (shared with web).
 * Surfaces follow docs/07; brand accent is Satsuma.
 */

export type ThemeMode = 'dark' | 'light';

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

export const darkTokens = {
  bgPage: '#0B0F14',
  bgSurface1: '#131920',
  bgSurface2: '#1B232C',
  border: '#26313C',
  textPrimary: '#F5F7FA',
  textSecondary: '#8B98A5',
  accent: brandColors.primary,
} as const;

export const lightTokens = {
  bgPage: '#F7F9FB',
  bgSurface1: '#FFFFFF',
  bgSurface2: '#F1F5F9',
  border: '#E2E8F0',
  textPrimary: '#101418',
  textSecondary: '#5B6672',
  accent: brandColors.primary,
} as const;

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
  severityEmpty: brandColors.neutralGray,
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
  /** Şartlı Onay — Kalite Onay green opened toward white. */
  issueConditionalApproved: mixTowardWhite(statusColorBase.ok, 42),
};

/**
 * Lighten an existing token toward white. Used when a softer variant is
 * needed and the palette has no dedicated swatch — never a new hardcoded hex.
 */
export function mixTowardWhite(hex: string, whitePct: number): string {
  const h = hex.replace('#', '');
  const r = Number.parseInt(h.slice(0, 2), 16);
  const g = Number.parseInt(h.slice(2, 4), 16);
  const b = Number.parseInt(h.slice(4, 6), 16);
  const t = Math.min(100, Math.max(0, whitePct)) / 100;
  return `rgb(${Math.round(r + (255 - r) * t)}, ${Math.round(g + (255 - g) * t)}, ${Math.round(b + (255 - b) * t)})`;
}

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
