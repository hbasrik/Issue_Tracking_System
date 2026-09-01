import { localeTag, type Locale } from './types';

export function formatDateTime(
  iso: string | null | undefined,
  locale: Locale,
): string {
  if (!iso || iso.startsWith('0001')) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(localeTag(locale), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function formatDateTimeShort(
  iso: string | null | undefined,
  locale: Locale,
): string {
  if (!iso || iso.startsWith('0001')) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(localeTag(locale), {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function formatActionAt(
  iso: string | null | undefined,
  locale: Locale,
): string | null {
  if (!iso || iso.startsWith('0001')) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(localeTag(locale), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function formatShortDay(
  d: Date,
  locale: Locale,
  withWeekday: boolean,
): string {
  return d.toLocaleDateString(localeTag(locale), {
    weekday: withWeekday ? 'short' : undefined,
    day: 'numeric',
    month: 'short',
  });
}
