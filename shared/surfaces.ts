/**
 * Surface / chrome palette — single source for web and mobile.
 * Do not redefine these values in platform theme files.
 *
 * Light cards sit on bgPage; border must stay strong enough that a 1px
 * edge reads on both CSS and React Native (device pixels).
 */

/** Keep in sync with `brandColors.primary` in shared/brand.ts. */
const BRAND_PRIMARY = '#FF3B1E';

export function mixTowardWhite(hex: string, whitePct: number): string {
  const h = hex.replace('#', '');
  const r = Number.parseInt(h.slice(0, 2), 16);
  const g = Number.parseInt(h.slice(2, 4), 16);
  const b = Number.parseInt(h.slice(4, 6), 16);
  const t = Math.min(100, Math.max(0, whitePct)) / 100;
  return `rgb(${Math.round(r + (255 - r) * t)}, ${Math.round(g + (255 - g) * t)}, ${Math.round(b + (255 - b) * t)})`;
}

export function mixTowardBlack(hex: string, blackPct: number): string {
  const h = hex.replace('#', '');
  const r = Number.parseInt(h.slice(0, 2), 16);
  const g = Number.parseInt(h.slice(2, 4), 16);
  const b = Number.parseInt(h.slice(4, 6), 16);
  const t = Math.min(100, Math.max(0, blackPct)) / 100;
  return `rgb(${Math.round(r * (1 - t))}, ${Math.round(g * (1 - t))}, ${Math.round(b * (1 - t))})`;
}

export const lightInk = '#101418';

/**
 * Light surfaces. Border is ink mixed 48% toward white so card edges meet
 * WCAG 3:1 non-text contrast against both bgSurface1 and bgPage on CSS and
 * React Native (was 52% → ~3.29:1 on white; still looked soft on device fill).
 */
export const lightSurfaces = {
  bgPage: '#F7F9FB',
  bgSurface1: '#FFFFFF',
  bgSurface2: '#F1F5F9',
  border: mixTowardWhite(lightInk, 48),
  textPrimary: lightInk,
  textSecondary: '#5B6672',
  accent: BRAND_PRIMARY,
} as const;

export const darkSurfaces = {
  bgPage: '#0B0F14',
  bgSurface1: '#131920',
  bgSurface2: mixTowardWhite('#131920', 16),
  /** Lightened enough for ≥3:1 against surface-1 and page. */
  border: mixTowardWhite('#26313C', 28),
  textPrimary: '#F5F7FA',
  textSecondary: mixTowardWhite('#8B98A5', 14),
  accent: BRAND_PRIMARY,
} as const;

export type SurfaceTokens = typeof lightSurfaces;

/**
 * Subtle card lift — use with the border, not instead of it.
 * Keep opacity low so light + dark stay calm.
 */
export const lightCardElevation = {
  shadowColor: lightInk,
  shadowOpacity: 0.1,
  shadowRadius: 3,
  shadowOffset: { width: 0, height: 1 } as const,
  elevation: 2,
  cssBoxShadow: '0 1px 3px rgba(16, 20, 24, 0.10)',
} as const;

export const darkCardElevation = {
  shadowColor: '#000000',
  shadowOpacity: 0.45,
  shadowRadius: 4,
  shadowOffset: { width: 0, height: 1 } as const,
  elevation: 3,
  cssBoxShadow: '0 1px 4px rgba(0, 0, 0, 0.45)',
} as const;

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

/** WCAG contrast ratio between two CSS colors (#hex or rgb()). */
export function contrastRatio(a: string, b: string): number {
  const ra = parseRgb(a);
  const rb = parseRgb(b);
  if (!ra || !rb) return 0;
  const la = luminance(ra);
  const lb = luminance(rb);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}
