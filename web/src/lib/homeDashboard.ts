import type { Issue, Station, VehicleSeverityBreakdown } from './api';
import { brandColors, statusColors } from '../theme/tokens';
import type { SeverityLevel } from '../components/SeverityIndicator';
import type { Translate } from '../../../shared/i18n';

const DAY_MS = 24 * 60 * 60 * 1000;
const OPEN_STATUSES = new Set(['OPEN', 'IN_PROGRESS', 'DONE']);
const BACKLOG_DAYS = 90;
const WEEK_DAYS = 7;
const TOP_VEHICLES = 8;

export type DeltaPolarity = 'up' | 'down' | 'neutral';

export type DayCount = {
  day: string;
  label: string;
  count: number;
};

export type BacklogPoint = {
  day: string;
  label: string;
  open: number;
};

export type RankedVehicle = {
  rank: number;
  vin: string;
  vinTail: string;
  openCount: number;
  barPct: number;
  worstSeverity: SeverityLevel;
};

export type NamedCount = {
  name: string;
  value: number;
  color: string;
};

export type StationOpenCount = {
  station: string;
  count: number;
};

export type HomeDashboardMetrics = {
  openNow: number;
  openPrev: number;
  closedToday: number;
  closedPrevDay: number;
  inProgressNow: number;
  inProgressPrev: number;
  approvedToday: number;
  approvedPrevDay: number;
  conditionalToday: number;
  conditionalPrevDay: number;
  weekly: DayCount[];
  backlog: BacklogPoint[];
  resolvedCount: number;
  totalCount: number;
  resolutionRate: number;
  topVehicles: RankedVehicle[];
  openSeverity: NamedCount[];
  openByStation: StationOpenCount[];
  mttrHours: number | null;
  mttrSample: number;
  pendingQualityNow: number;
  pendingQualityPrev: number;
  criticalNow: number;
  criticalPrev: number;
  sparkOpen: DayCount[];
  sparkInProgress: DayCount[];
  sparkPending: DayCount[];
  sparkCritical: DayCount[];
};

export function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function endOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

export function addLocalDays(d: Date, n: number): Date {
  const next = startOfLocalDay(d);
  next.setDate(next.getDate() + n);
  return next;
}

export function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseInstant(iso?: string | null): number | null {
  if (!iso) return null;
  if (iso.startsWith('0001-')) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

/** When the defect entered the backlog — prefer IssueDate (report time). */
function reportedAt(issue: Issue): number | null {
  return parseInstant(issue.IssueDate) ?? parseInstant(issue.CreatedAt);
}

/** Quality-close instant: APPROVED / CONDITIONAL_APPROVED timestamps. */
export function qualityClosedAt(issue: Issue): number | null {
  const approved = parseInstant(issue.ApproveDate);
  const conditional = parseInstant(issue.ConditionalApproveDate);
  if (issue.Status === 'APPROVED') {
    return approved ?? conditional ?? parseInstant(issue.UpdatedAt);
  }
  if (issue.Status === 'CONDITIONAL_APPROVED') {
    return conditional ?? approved ?? parseInstant(issue.UpdatedAt);
  }
  return approved ?? conditional;
}

export function isOpenAt(issue: Issue, atMs: number): boolean {
  const created = reportedAt(issue);
  if (created == null || created > atMs) return false;
  const closed = qualityClosedAt(issue);
  if (closed != null && closed <= atMs) return false;
  return true;
}

export function isInProgressAt(issue: Issue, atMs: number): boolean {
  if (!isOpenAt(issue, atMs)) return false;
  const process = parseInstant(issue.ProcessDate);
  if (process == null || process > atMs) return false;
  const finish = parseInstant(issue.FinishDate);
  if (finish != null && finish <= atMs) return false;
  return true;
}

function fallsOnLocalDay(atMs: number | null, day: Date): boolean {
  if (atMs == null) return false;
  const d = new Date(atMs);
  return (
    d.getFullYear() === day.getFullYear() &&
    d.getMonth() === day.getMonth() &&
    d.getDate() === day.getDate()
  );
}

/** OPEN + IN_PROGRESS — excludes DONE (pending quality). */
export function countOpenNow(issues: Issue[]): number {
  return issues.filter(
    (i) => i.Status === 'OPEN' || i.Status === 'IN_PROGRESS',
  ).length;
}

/** Snapshot of OPEN + IN_PROGRESS at an instant (not pending quality). */
export function isActiveOpenAt(issue: Issue, atMs: number): boolean {
  return isOpenAt(issue, atMs) && !isPendingQualityAt(issue, atMs);
}

export function countInProgressNow(issues: Issue[]): number {
  return issues.filter((i) => i.Status === 'IN_PROGRESS').length;
}

export function isPendingQualityAt(issue: Issue, atMs: number): boolean {
  const finish = parseInstant(issue.FinishDate);
  if (finish == null || finish > atMs) return false;
  const closed = qualityClosedAt(issue);
  if (closed != null && closed <= atMs) return false;
  return true;
}

export function isCriticalOpenAt(issue: Issue, atMs: number): boolean {
  return (
    isActiveOpenAt(issue, atMs) && issue.Severity.toUpperCase() === 'CRITICAL'
  );
}

export function countPendingQualityNow(issues: Issue[]): number {
  return issues.filter((i) => i.Status === 'DONE').length;
}

export function countCriticalNow(issues: Issue[]): number {
  return issues.filter(
    (i) =>
      (i.Status === 'OPEN' || i.Status === 'IN_PROGRESS') &&
      i.Severity.toUpperCase() === 'CRITICAL',
  ).length;
}

export function snapshotPerDay(
  issues: Issue[],
  now: Date,
  days: number,
  atEndOfDay: (issue: Issue, atMs: number) => boolean,
  locale = 'tr-TR',
): DayCount[] {
  const start = addLocalDays(now, -(days - 1));
  const out: DayCount[] = [];
  for (let i = 0; i < days; i++) {
    const date = addLocalDays(start, i);
    const end = endOfLocalDay(date);
    let count = 0;
    for (const issue of issues) {
      if (atEndOfDay(issue, end.getTime())) count += 1;
    }
    out.push({
      day: localDayKey(date),
      label: shortDayLabel(date, false, locale),
      count,
    });
  }
  return out;
}

export function formatAbsDelta(current: number, previous: number): string {
  const diff = current - previous;
  if (diff === 0) return '0';
  return diff > 0 ? `+${diff}` : String(diff);
}

export function isOpenIssueStatus(status: string): boolean {
  return OPEN_STATUSES.has(status);
}

export function isQualityClosedStatus(status: string): boolean {
  return status === 'APPROVED' || status === 'CONDITIONAL_APPROVED';
}

export function countClosedOnDay(issues: Issue[], day: Date): number {
  return issues.filter((i) => {
    if (!isQualityClosedStatus(i.Status)) return false;
    const closed = qualityClosedAt(i);
    return closed != null && fallsOnLocalDay(closed, day);
  }).length;
}

export function countApprovedOnDay(issues: Issue[], day: Date): number {
  return issues.filter((i) => {
    if (i.Status !== 'APPROVED') return false;
    const at = parseInstant(i.ApproveDate) ?? parseInstant(i.UpdatedAt);
    return at != null && fallsOnLocalDay(at, day);
  }).length;
}

export function countConditionalOnDay(issues: Issue[], day: Date): number {
  return issues.filter((i) => {
    if (i.Status !== 'CONDITIONAL_APPROVED') return false;
    const at =
      parseInstant(i.ConditionalApproveDate) ?? parseInstant(i.UpdatedAt);
    return at != null && fallsOnLocalDay(at, day);
  }).length;
}

function shortDayLabel(d: Date, withWeekday: boolean, locale = 'tr-TR'): string {
  return d.toLocaleDateString(locale, {
    weekday: withWeekday ? 'short' : undefined,
    day: 'numeric',
    month: 'short',
  });
}

export function reportedPerDay(
  issues: Issue[],
  now: Date,
  days = WEEK_DAYS,
  locale = 'tr-TR',
): DayCount[] {
  const start = addLocalDays(now, -(days - 1));
  const buckets = new Map<string, { date: Date; count: number }>();
  for (let i = 0; i < days; i++) {
    const date = addLocalDays(start, i);
    buckets.set(localDayKey(date), { date, count: 0 });
  }
  for (const issue of issues) {
    const t = reportedAt(issue);
    if (t == null) continue;
    const key = localDayKey(new Date(t));
    const bucket = buckets.get(key);
    if (bucket) bucket.count += 1;
  }
  return [...buckets.values()].map(({ date, count }) => ({
    day: localDayKey(date),
    label: shortDayLabel(date, false, locale),
    count,
  }));
}

export function openBacklogByDay(
  issues: Issue[],
  now: Date,
  maxDays = BACKLOG_DAYS,
  locale = 'tr-TR',
): BacklogPoint[] {
  if (issues.length === 0) return [];
  let earliest = Infinity;
  for (const issue of issues) {
    const t = reportedAt(issue);
    if (t != null && t < earliest) earliest = t;
  }
  if (!Number.isFinite(earliest)) return [];

  const windowStart = addLocalDays(now, -(maxDays - 1));
  const dataStart = startOfLocalDay(
    new Date(Math.max(earliest, windowStart.getTime())),
  );
  const today = startOfLocalDay(now);
  const out: BacklogPoint[] = [];
  for (let d = new Date(dataStart); d.getTime() <= today.getTime(); d = addLocalDays(d, 1)) {
    const end = endOfLocalDay(d);
    let open = 0;
    for (const issue of issues) {
      if (isOpenAt(issue, end.getTime())) open += 1;
    }
    out.push({
      day: localDayKey(d),
      label: shortDayLabel(d, false, locale),
      open,
    });
  }
  return out;
}

export function worstOpenSeverity(row: VehicleSeverityBreakdown): SeverityLevel {
  if (row.CriticalCount > 0) return 'CRITICAL';
  if (row.MediumCount > 0) return 'MEDIUM';
  return 'LOW';
}

export function rankTopVehicles(
  rows: VehicleSeverityBreakdown[],
  limit = TOP_VEHICLES,
): RankedVehicle[] {
  const ranked = rows
    .filter((r) => r.TotalOpenIssues > 0)
    .slice()
    .sort((a, b) => b.TotalOpenIssues - a.TotalOpenIssues)
    .slice(0, limit);
  const max = ranked[0]?.TotalOpenIssues ?? 0;
  return ranked.map((row, i) => ({
    rank: i + 1,
    vin: row.VIN,
    vinTail: row.VIN.slice(-5),
    openCount: row.TotalOpenIssues,
    barPct: max > 0 ? (row.TotalOpenIssues / max) * 100 : 0,
    worstSeverity: worstOpenSeverity(row),
  }));
}

export function formatPercentDelta(current: number, previous: number): string {
  if (previous === 0) {
    if (current === 0) return '0%';
    return '+100%';
  }
  const pct = ((current - previous) / previous) * 100;
  const rounded =
    Math.abs(pct) >= 10 ? Math.round(pct) : Math.round(pct * 10) / 10;
  const sign = rounded > 0 ? '+' : '';
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${sign}${text}%`;
}

/** Sign of the period-over-period change — not “good/bad for this metric”. */
export function deltaPolarity(current: number, previous: number): DeltaPolarity {
  const diff = current - previous;
  if (diff === 0) return 'neutral';
  return diff > 0 ? 'up' : 'down';
}

/** Mix a token toward brand gray — no new hex. */
export function muteColor(color: string, grayMix = 36): string {
  return `color-mix(in srgb, ${color} ${100 - grayMix}%, ${brandColors.neutralGray})`;
}

export function deltaColor(polarity: DeltaPolarity): string {
  if (polarity === 'up') return statusColors.ok;
  if (polarity === 'down') return statusColors.notOk;
  return statusColors.pending;
}

export function openSeveritySplit(issues: Issue[]): NamedCount[] {
  let critical = 0;
  let medium = 0;
  let low = 0;
  for (const issue of issues) {
    if (!OPEN_STATUSES.has(issue.Status)) continue;
    const s = issue.Severity.toUpperCase();
    if (s === 'CRITICAL') critical += 1;
    else if (s === 'MEDIUM') medium += 1;
    else if (s === 'LOW') low += 1;
  }
  return [
    {
      name: 'Critical',
      value: critical,
      color: muteColor(statusColors.severityCritical, 40),
    },
    {
      name: 'Medium',
      value: medium,
      color: muteColor(statusColors.severityMedium, 32),
    },
    {
      name: 'Low',
      value: low,
      color: statusColors.severityLow,
    },
  ];
}

export function openIssuesByStation(
  issues: Issue[],
  stations: Station[],
  reportedSinceMs?: number,
): StationOpenCount[] {
  const seqByID = new Map(stations.map((s) => [s.ID, s.SequenceNo]));
  const counts = new Map<string, number>();
  for (const issue of issues) {
    if (!OPEN_STATUSES.has(issue.Status)) continue;
    if (reportedSinceMs != null) {
      const reported = reportedAt(issue);
      if (reported == null || reported < reportedSinceMs) continue;
    }
    let key = 'Unknown';
    if (issue.StationID != null) {
      const seq = seqByID.get(issue.StationID);
      key = seq != null ? `seq:${seq}` : `Station ${issue.StationID}`;
    }
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([station, count]) => ({ station, count }))
    .sort((a, b) => {
      const as = /^seq:(\d+)$/.exec(a.station);
      const bs = /^seq:(\d+)$/.exec(b.station);
      if (as && bs) return Number(as[1]) - Number(bs[1]);
      return b.count - a.count;
    });
}

export function meanResolutionHours(issues: Issue[]): {
  hours: number | null;
  sample: number;
} {
  const durations: number[] = [];
  for (const issue of issues) {
    const start = parseInstant(issue.ProcessDate);
    const end = parseInstant(issue.FinishDate);
    if (start == null || end == null || end <= start) continue;
    durations.push(end - start);
  }
  if (durations.length === 0) return { hours: null, sample: 0 };
  const avgMs = durations.reduce((a, b) => a + b, 0) / durations.length;
  return { hours: avgMs / 3_600_000, sample: durations.length };
}

export function formatMttr(hours: number, t: Translate): string {
  if (hours < 1) return t('home.mttrMinutes', { n: Math.round(hours * 60) });
  if (hours < 48) return t('home.mttrHours', { n: hours.toFixed(1) });
  return t('home.mttrDays', { n: (hours / 24).toFixed(1) });
}

export function buildHomeDashboard(
  issues: Issue[],
  vehicles: VehicleSeverityBreakdown[],
  stations: Station[] = [],
  now: Date = new Date(),
  locale = 'tr-TR',
): HomeDashboardMetrics {
  const today = startOfLocalDay(now);
  const yesterday = addLocalDays(today, -1);
  const ago24h = now.getTime() - DAY_MS;
  const resolvedCount = issues.filter((i) =>
    isQualityClosedStatus(i.Status),
  ).length;
  const totalCount = issues.length;
  const mttr = meanResolutionHours(issues);

  return {
    openNow: countOpenNow(issues),
    openPrev: issues.filter((i) => isActiveOpenAt(i, ago24h)).length,
    closedToday: countClosedOnDay(issues, today),
    closedPrevDay: countClosedOnDay(issues, yesterday),
    inProgressNow: countInProgressNow(issues),
    inProgressPrev: issues.filter((i) => isInProgressAt(i, ago24h)).length,
    approvedToday: countApprovedOnDay(issues, today),
    approvedPrevDay: countApprovedOnDay(issues, yesterday),
    conditionalToday: countConditionalOnDay(issues, today),
    conditionalPrevDay: countConditionalOnDay(issues, yesterday),
    weekly: reportedPerDay(issues, now, WEEK_DAYS, locale),
    backlog: openBacklogByDay(issues, now, BACKLOG_DAYS, locale),
    resolvedCount,
    totalCount,
    resolutionRate: totalCount === 0 ? 0 : resolvedCount / totalCount,
    topVehicles: rankTopVehicles(vehicles),
    openSeverity: openSeveritySplit(issues),
    openByStation: openIssuesByStation(issues, stations),
    mttrHours: mttr.hours,
    mttrSample: mttr.sample,
    pendingQualityNow: countPendingQualityNow(issues),
    pendingQualityPrev: issues.filter((i) => isPendingQualityAt(i, ago24h)).length,
    criticalNow: countCriticalNow(issues),
    criticalPrev: issues.filter((i) => isCriticalOpenAt(i, ago24h)).length,
    sparkOpen: snapshotPerDay(issues, now, WEEK_DAYS, isActiveOpenAt, locale),
    sparkInProgress: snapshotPerDay(issues, now, WEEK_DAYS, isInProgressAt, locale),
    sparkPending: snapshotPerDay(
      issues,
      now,
      WEEK_DAYS,
      isPendingQualityAt,
      locale,
    ),
    sparkCritical: snapshotPerDay(
      issues,
      now,
      WEEK_DAYS,
      isCriticalOpenAt,
      locale,
    ),
  };
}
