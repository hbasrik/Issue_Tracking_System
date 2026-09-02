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
  /**
   * Şartlı Onay — palette olive, a paler sibling of Kalite Onay green.
   * Same hex everywhere (chip, badge, home) — not mixed per theme.
   */
  issueConditionalApproved: brandColors.neutralOlive,
  vehicleInProduction: brandColors.secondary,
  vehicleInWarehouse: brandColors.neutralGray,
  vehicleWithCustomer: '#F59E0B',
  vehicleShipped: '#22C55E',
  vehicleOnHold: brandColors.critical,
};

export const statusColors = {
  ...statusColorBase,
  get severityEmpty() {
    return currentMode === 'light'
      ? mixTowardWhite(lightInk, 58)
      : brandColors.neutralGray;
  },
};

function srgbChannel(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function toHex(color: string): string | null {
  const rgb = parseRgb(color);
  if (!rgb) return null;
  return `#${rgb.map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

function parseRgb(color: string): [number, number, number] | null {
  if (color.startsWith('#')) {
    const h = color.replace('#', '');
    if (h.length < 6) return null;
    return [
      Number.parseInt(h.slice(0, 2), 16),
      Number.parseInt(h.slice(2, 4), 16),
      Number.parseInt(h.slice(4, 6), 16),
    ];
  }
  const m = color.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function luminance(rgb: [number, number, number]): number {
  return (
    0.2126 * srgbChannel(rgb[0]) +
    0.7152 * srgbChannel(rgb[1]) +
    0.0722 * srgbChannel(rgb[2])
  );
}

function contrastRatio(a: string, b: string): number {
  const ra = parseRgb(a);
  const rb = parseRgb(b);
  if (!ra || !rb) return 0;
  const L1 = luminance(ra);
  const L2 = luminance(rb);
  const [hi, lo] = L1 > L2 ? [L1, L2] : [L2, L1];
  return (hi + 0.05) / (lo + 0.05);
}

/** White or ink on `bg` — pick the one that meets WCAG AA against the fill. */
export function inkOn(bg: string): string {
  const rgb = parseRgb(bg);
  if (!rgb) return mixTowardWhite(brandColors.primary, 100);
  const L = luminance(rgb);
  const contrastWhite = 1.05 / (L + 0.05);
  return contrastWhite >= 4.5
    ? mixTowardWhite(brandColors.primary, 100)
    : lightInk;
}

/** Blend `fg` over `bg` by `fgPct` (0–100) — same mix as CSS `color-mix`. */
export function mixColors(fg: string, bg: string, fgPct: number): string {
  const a = parseRgb(fg);
  const b = parseRgb(bg);
  if (!a || !b) return fg;
  const t = Math.min(100, Math.max(0, fgPct)) / 100;
  return `rgb(${Math.round(b[0] + (a[0] - b[0]) * t)}, ${Math.round(b[1] + (a[1] - b[1]) * t)}, ${Math.round(b[2] + (a[2] - b[2]) * t)})`;
}

/** Keep `fg` if it meets AA on `bg`; otherwise walk it toward black/white until it does. */
export function readableOn(fg: string, bg: string): string {
  if (contrastRatio(fg, bg) >= 4.5) return fg;
  const hex = toHex(fg);
  if (!hex) return fg;
  for (let p = 10; p <= 85; p += 5) {
    const darker = mixTowardBlack(hex, p);
    if (contrastRatio(darker, bg) >= 4.5) return darker;
    const lighter = mixTowardWhite(hex, p);
    if (contrastRatio(lighter, bg) >= 4.5) return lighter;
  }
  return inkOn(bg);
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
