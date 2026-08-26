/**
 * Color tokens — Design system v3 (shared with mobile).
 * Surfaces follow docs/07; brand accent is Satsuma.
 */

export type ThemeMode = 'dark' | 'light';

/** localStorage / AsyncStorage key — only written after an explicit user choice. */
export const THEME_STORAGE_KEY = 'karea-theme-mode';

export function parseThemeMode(raw: string | null | undefined): ThemeMode | null {
  if (raw === 'dark' || raw === 'light') return raw;
  return null;
}

/** Active mode for status colors that differ on light vs dark (empty bars). */
let currentMode: ThemeMode = 'light';

export function bindThemeMode(mode: ThemeMode): void {
  currentMode = mode;
}

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

/**
 * 4px spacing scale. Prefer these over ad-hoc margins so web and mobile
 * share the same rhythm (Tailwind `p-4` = space[4] = 16).
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

/**
 * Lighten an existing token toward white. Function declarations are hoisted
 * so surface tokens and statusColors can call them at module init.
 */
export function mixTowardWhite(hex: string, whitePct: number): string {
  const h = hex.replace('#', '');
  const r = Number.parseInt(h.slice(0, 2), 16);
  const g = Number.parseInt(h.slice(2, 4), 16);
  const b = Number.parseInt(h.slice(4, 6), 16);
  const t = Math.min(100, Math.max(0, whitePct)) / 100;
  return `rgb(${Math.round(r + (255 - r) * t)}, ${Math.round(g + (255 - g) * t)}, ${Math.round(b + (255 - b) * t)})`;
}

/** Darken an existing token toward black — light-theme contrast without a new hex. */
export function mixTowardBlack(hex: string, blackPct: number): string {
  const h = hex.replace('#', '');
  const r = Number.parseInt(h.slice(0, 2), 16);
  const g = Number.parseInt(h.slice(2, 4), 16);
  const b = Number.parseInt(h.slice(4, 6), 16);
  const t = Math.min(100, Math.max(0, blackPct)) / 100;
  return `rgb(${Math.round(r * (1 - t))}, ${Math.round(g * (1 - t))}, ${Math.round(b * (1 - t))})`;
}

function srgbChannel(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
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

function toHex(color: string): string | null {
  const rgb = parseRgb(color);
  if (!rgb) return null;
  return `#${rgb.map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

export function contrastAgainst(fg: string, bg: string): number {
  return contrastRatio(fg, bg);
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

export const darkTokens = {
  'bg-page': '#0B0F14',
  'bg-surface-1': '#131920',
  'bg-surface-2': '#1B232C',
  border: '#26313C',
  'text-primary': '#F5F7FA',
  'text-secondary': '#8B98A5',
  accent: brandColors.primary,
} as const;

const lightInk = '#101418';

export const lightTokens = {
  'bg-page': '#F7F9FB',
  'bg-surface-1': '#FFFFFF',
  'bg-surface-2': '#F1F5F9',
  /** Derived from text-primary — stronger than a near-white slate so cards read. */
  border: mixTowardWhite(lightInk, 72),
  'text-primary': lightInk,
  'text-secondary': '#5B6672',
  accent: brandColors.primary,
};

/** Semantic status colors. Şartlı Onay / empty bars follow the bound theme. */
const statusColorBase = {
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
  /** Vehicle status */
  vehicleInProduction: brandColors.secondary,
  vehicleInWarehouse: brandColors.neutralGray,
  vehicleWithCustomer: '#F59E0B',
  vehicleShipped: '#22C55E',
  vehicleOnHold: brandColors.critical,
  /** Issue status — five mutually distinct tokens, no new palette hex. */
  issueOpen: brandColors.critical,
  /** İşlemde — existing amber (not dashboard blue, not Satsuma). */
  issueInProgress: '#F59E0B',
  /** Tamamlandı — brand secondary blue, distinct from İşlemde amber. */
  issueDone: brandColors.secondary,
  /** Kalite Onay — full green (same swatch as `ok`). */
  issueResolved: '#22C55E',
  /**
   * Şartlı Onay — palette olive, a paler sibling of Kalite Onay green.
   * Same hex everywhere (chip, badge, home/analiz) — not mixed per theme.
   */
  issueConditionalApproved: brandColors.neutralOlive,
};

export const statusColors = {
  ...statusColorBase,
  /** Unfilled severity bars — mid gray on dark, ink-derived on light. */
  get severityEmpty() {
    return currentMode === 'light'
      ? mixTowardWhite(lightInk, 58)
      : brandColors.neutralGray;
  },
};

export function tokensFor(mode: ThemeMode) {
  return mode === 'dark' ? darkTokens : lightTokens;
}

/** Apply CSS custom properties to :root for the active theme. */
export function applyThemeVars(mode: ThemeMode): void {
  bindThemeMode(mode);
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
  root.style.setProperty('--sidebar-bg', sidebarTokens.bg);
  root.style.setProperty('--sidebar-text', sidebarTokens.text);
  for (const [key, value] of Object.entries(space)) {
    root.style.setProperty(`--space-${key}`, `${value}px`);
  }
}

function kebab(s: string): string {
  return s.replace(/([A-Z])/g, '-$1').toLowerCase();
}
