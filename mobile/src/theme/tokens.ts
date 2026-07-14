/**
 * Color tokens from docs/07_KAREA_UIUX_Tasarim_Rehberi.md Section 1.1 + Section 5.
 * Dark mode is the default for the field operator app.
 */

export type ThemeMode = 'dark' | 'light';

export const darkTokens = {
  bgPage: '#0B0F14',
  bgSurface1: '#131920',
  bgSurface2: '#1B232C',
  border: '#26313C',
  textPrimary: '#F5F7FA',
  textSecondary: '#8B98A5',
  accent: '#2F8FFF',
} as const;

export const lightTokens = {
  bgPage: '#F7F9FB',
  bgSurface1: '#FFFFFF',
  bgSurface2: '#F1F5F9',
  border: '#E2E8F0',
  textPrimary: '#101418',
  textSecondary: '#5B6672',
  accent: '#1D6FE0',
} as const;

export const statusColors = {
  ok: '#22C55E',
  notOk: '#EF4444',
  rework: '#8B5CF6',
  conditionalOk: '#F59E0B',
  info: '#38BDF8',
  pending: '#8B98A5',
  severityCritical: '#791F1F',
  severityMedium: '#F59E0B',
  severityLow: '#38BDF8',
  issueOpen: '#EF4444',
  issueInProgress: '#F59E0B',
  issueResolved: '#22C55E',
} as const;

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
