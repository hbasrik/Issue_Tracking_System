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

/** Inclusive calendar-day range label, e.g. "18–24 Ağu" / "18–24 Aug". */
export function formatDateRangeShort(
  fromIso: string | null | undefined,
  toIso: string | null | undefined,
  locale: Locale,
): string {
  if (!fromIso || !toIso) return '';
  const from = parseUtcCalendarDay(fromIso);
  const to = parseUtcCalendarDay(toIso);
  if (!from || !to) return '';
  const tag = localeTag(locale);
  const dayMonth = (d: Date) =>
    d.toLocaleDateString(tag, { day: 'numeric', month: 'short' });
  if (from.getTime() === to.getTime()) return dayMonth(from);
  const sameMonth =
    from.getUTCFullYear() === to.getUTCFullYear() &&
    from.getUTCMonth() === to.getUTCMonth();
  if (sameMonth) {
    const month = to.toLocaleDateString(tag, { month: 'short' });
    return `${from.getUTCDate()}–${to.getUTCDate()} ${month}`;
  }
  return `${dayMonth(from)}–${dayMonth(to)}`;
}

/** Full inclusive range for tooltips, e.g. "18.08.2026 – 24.08.2026". */
export function formatDateRangeFull(
  fromIso: string | null | undefined,
  toIso: string | null | undefined,
  locale: Locale,
): string {
  if (!fromIso || !toIso) return '';
  const from = parseUtcCalendarDay(fromIso);
  const to = parseUtcCalendarDay(toIso);
  if (!from || !to) return '';
  const tag = localeTag(locale);
  const one = (d: Date) =>
    d.toLocaleDateString(tag, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  if (from.getTime() === to.getTime()) return one(from);
  return `${one(from)} – ${one(to)}`;
}

function parseUtcCalendarDay(iso: string): Date | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
