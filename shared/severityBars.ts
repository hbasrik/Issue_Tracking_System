/**
 * Severity bar icon geometry — single source for web and mobile.
 * Colours come from shared/brand.ts (severityColors).
 *
 * The level must read without colour: filled bars are solid, empty bars are
 * hollow outlines, so LOW / MEDIUM / CRITICAL differ by shape (1 / 2 / 3 solid
 * bars) even in grayscale or for colour-blind users.
 */

export type SeverityBarLevel = 'CRITICAL' | 'MEDIUM' | 'LOW';

export const SEVERITY_BAR = {
  widths: [4, 4, 4] as const,
  heights: [6, 11, 16] as const,
  gap: 2,
  radius: 1,
  /** Outline width of an empty (hollow) bar. */
  emptyBorder: 1,
} as const;

/** Scale for the larger variant (issue cards, where it stands alone). */
export const SEVERITY_BAR_MD_SCALE = 1.25;

export const SEVERITY_FILLED_BARS: Record<SeverityBarLevel, number> = {
  LOW: 1,
  MEDIUM: 2,
  CRITICAL: 3,
};
