/**
 * Brand + severity palette — single source for web and mobile.
 * Do not redefine these hex values in platform theme files.
 */

export const BRAND_NAME = 'KAREA';

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
 * Issue severity fills (Wi-Fi bars + text labels).
 * CRITICAL red, MEDIUM amber, LOW brand secondary blue.
 */
export const severityColors = {
  CRITICAL: brandColors.critical,
  MEDIUM: '#EAB308',
  LOW: brandColors.secondary,
} as const;

export type SeverityColorCode = keyof typeof severityColors;

export function severityColorFor(severity: string): string | null {
  const v = severity.toUpperCase();
  if (v === 'CRITICAL' || v === 'MEDIUM' || v === 'LOW') {
    return severityColors[v];
  }
  return null;
}
