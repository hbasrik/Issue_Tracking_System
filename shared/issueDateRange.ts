/**
 * Issue list opening-date filter (docs/16 A57).
 *
 * Days are plant calendar days (Europe/Istanbul, same zone as the API's
 * domain.PlantTimeZone): the API turns opened_from / opened_to into local
 * midnights, so "Bugün" is today on the plant clock whatever the device
 * zone is. Presets stay presets in the URL (?opened=7d), so a shared link
 * means "the last 7 days" on the day it is opened; custom ranges are fixed
 * days (?opened_from=2026-10-01&opened_to=2026-10-07).
 */

export const ISSUE_DATE_TIME_ZONE = 'Europe/Istanbul';

export const ISSUE_DATE_PRESETS = ['today', '7d', 'month'] as const;
export type IssueDatePreset = (typeof ISSUE_DATE_PRESETS)[number];

export const ISSUE_DATE_PARAM = {
  preset: 'opened',
  from: 'opened_from',
  to: 'opened_to',
} as const;

export type IssueDateRange = { from?: string; to?: string };
export type IssueDateFilter = { preset?: IssueDatePreset } & IssueDateRange;

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real YYYY-MM-DD calendar day (rejects 2026-02-30). */
export function isCalendarDay(value: string | null | undefined): value is string {
  if (!value) return false;
  const m = DAY_RE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === value;
}

/** The plant calendar day (YYYY-MM-DD) an instant falls on; '' if invalid. */
export function plantCalendarDay(instant: Date): string {
  if (Number.isNaN(instant.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ISSUE_DATE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Today on the plant clock as YYYY-MM-DD. */
export function plantToday(now: Date): string {
  return plantCalendarDay(now);
}

export function addCalendarDays(day: string, n: number): string {
  const m = DAY_RE.exec(day);
  if (!m) return day;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + n));
  return d.toISOString().slice(0, 10);
}

/** Inclusive day range of a preset. "Son 7 gün" = today and the 6 days before. */
export function presetRange(preset: IssueDatePreset, now: Date): Required<IssueDateRange> {
  const today = plantToday(now);
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case '7d':
      return { from: addCalendarDays(today, -6), to: today };
    case 'month':
      return { from: `${today.slice(0, 8)}01`, to: today };
  }
}

export function isIssueDatePreset(value: string | null | undefined): value is IssueDatePreset {
  return (ISSUE_DATE_PRESETS as readonly string[]).includes(value ?? '');
}

/** Reads the filter from URL params; a valid preset wins over custom days. */
export function readIssueDateFilter(params: { get(name: string): string | null }): IssueDateFilter {
  const preset = params.get(ISSUE_DATE_PARAM.preset);
  if (isIssueDatePreset(preset)) return { preset };
  const from = params.get(ISSUE_DATE_PARAM.from);
  const to = params.get(ISSUE_DATE_PARAM.to);
  return {
    ...(isCalendarDay(from) ? { from } : {}),
    ...(isCalendarDay(to) ? { to } : {}),
  };
}

/** Writes the filter into URL params (removes all three keys first). */
export function writeIssueDateFilter(params: URLSearchParams, filter: IssueDateFilter): void {
  params.delete(ISSUE_DATE_PARAM.preset);
  params.delete(ISSUE_DATE_PARAM.from);
  params.delete(ISSUE_DATE_PARAM.to);
  if (filter.preset) {
    params.set(ISSUE_DATE_PARAM.preset, filter.preset);
    return;
  }
  if (filter.from) params.set(ISSUE_DATE_PARAM.from, filter.from);
  if (filter.to) params.set(ISSUE_DATE_PARAM.to, filter.to);
}

/** Days sent to the API (opened_from / opened_to); presets resolved at `now`. */
export function resolveIssueDateRange(filter: IssueDateFilter, now: Date): IssueDateRange {
  if (filter.preset) return presetRange(filter.preset, now);
  return {
    ...(filter.from ? { from: filter.from } : {}),
    ...(filter.to ? { to: filter.to } : {}),
  };
}

export function hasIssueDateFilter(filter: IssueDateFilter): boolean {
  return Boolean(filter.preset || filter.from || filter.to);
}

/**
 * Editing one end of a custom range: keeps from <= to by moving the other
 * end, so the UI never sends a reversed range.
 */
export function editIssueDateRange(
  current: IssueDateRange,
  edit: { from?: string | null; to?: string | null },
): IssueDateRange {
  let from = current.from;
  let to = current.to;
  if (edit.from !== undefined) {
    from = isCalendarDay(edit.from) ? edit.from : undefined;
    if (from && to && to < from) to = from;
  }
  if (edit.to !== undefined) {
    to = isCalendarDay(edit.to) ? edit.to : undefined;
    if (from && to && from > to) from = to;
  }
  return { ...(from ? { from } : {}), ...(to ? { to } : {}) };
}
