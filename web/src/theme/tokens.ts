/**
 * Color tokens — Design system v3 (shared with mobile).
 * Surfaces follow docs/07; brand accent is Satsuma.
 */

export type ThemeMode = 'dark' | 'light';

/**
 * Layout breakpoints (aligned with Tailwind `screens`).
 * - mobile: &lt;640px
 * - tablet: 640–1023px
 * - desktop: ≥1024px
 */
export const breakpoints = {
  tablet: 640,
  desktop: 1024,
} as const;

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
  'bg-page': '#0B0F14',
  'bg-surface-1': '#131920',
  'bg-surface-2': '#1B232C',
  border: '#26313C',
  'text-primary': '#F5F7FA',
  'text-secondary': '#8B98A5',
  accent: brandColors.primary,
} as const;

export const lightTokens = {
  'bg-page': '#F7F9FB',
  'bg-surface-1': '#FFFFFF',
  'bg-surface-2': '#F1F5F9',
  border: '#E2E8F0',
  'text-primary': '#101418',
  'text-secondary': '#5B6672',
  accent: brandColors.primary,
} as const;

/** Semantic status colors (fixed across themes). */
export const statusColors = {
  ok: '#22C55E',
  notOk: brandColors.critical,
  rework: '#8B5CF6',
  conditionalOk: '#F59E0B',
  info: brandColors.secondary,
  pending: brandColors.neutralGray,
  /** Issue severity — Wi-Fi bars use these fills */
  severityCritical: brandColors.critical,
  severityMedium: '#EAB308',
  severityLow: brandColors.secondary,
  /** Unfilled severity bars */
  severityEmpty: brandColors.neutralGray,
  /** Vehicle status */
  vehicleInProduction: brandColors.secondary,
  vehicleInWarehouse: brandColors.neutralGray,
  vehicleWithCustomer: '#F59E0B',
  vehicleShipped: '#22C55E',
  vehicleOnHold: brandColors.critical,
  /** Issue status */
  issueOpen: brandColors.critical,
  issueInProgress: '#F59E0B',
  issueResolved: '#22C55E',
  /** Şartlı Onay — vehicle olive opened toward white (no new palette hex). */
  issueConditionalApproved: mixTowardWhite(brandColors.neutralOlive, 40),
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
  for (const [key, value] of Object.entries(brandColors)) {
    root.style.setProperty(`--brand-${kebab(key)}`, value);
  }
  for (const [key, value] of Object.entries(statusColors)) {
    root.style.setProperty(`--status-${kebab(key)}`, value);
  }
}

function kebab(s: string): string {
  return s.replace(/([A-Z])/g, '-$1').toLowerCase();
}
