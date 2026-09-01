export const LOCALES = ['tr', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'tr';
export const LOCALE_STORAGE_KEY = 'karea-locale';

export type Vars = Record<string, string | number>;

export function parseLocale(raw: string | null | undefined): Locale | null {
  if (raw === 'tr' || raw === 'en') return raw;
  return null;
}

export function localeTag(locale: Locale): string {
  return locale === 'en' ? 'en-GB' : 'tr-TR';
}
