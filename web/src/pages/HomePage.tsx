import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  BadgeCheck,
  BarChart3,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Factory,
  Gauge,
  History,
  Layers,
  MapPin,
  RefreshCw,
  Timer,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Warehouse,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  api,
  type HomeOverview,
  type Issue,
  type Station,
  type VehicleSeverityBreakdown,
} from '../lib/api';
import {
  addLocalDays,
  buildHomeDashboard,
  deltaColor,
  deltaPolarity,
  formatAbsDelta,
  formatMttr,
  muteColor,
  openIssuesByStation,
  type DayCount,
  type DeltaPolarity,
} from '../lib/homeDashboard';
import type { HomeIssueStatKey } from '../lib/homeIssueStats';
import { SeverityIndicator } from '../components/SeverityIndicator';
import { StatusBadge } from '../components/StatusBadge';
import { brandColors, statusColors } from '../theme/tokens';
import { useAuth } from '../auth/AuthProvider';
import { Perm } from '../auth/permissions';
import { useI18n } from '../i18n';
import { localeTag } from '../../../shared/i18n';
import { eolStageLabel } from '../lib/vehicleStatus';

const CHART_TOOLTIP = {
  background: 'var(--bg-surface-1)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  color: 'var(--text-primary)',
  fontSize: 12,
};

const mutedCaption = { color: 'var(--text-secondary)' } as const;


const STAGE_ICONS = {
  BRANCH: Building2,
  DEPOT: Warehouse,
  COMPLETED: CheckCircle2,
} as const;

const STAGE_COLORS = {
  BRANCH: statusColors.info,
  DEPOT: statusColors.ok,
  COMPLETED: muteColor(statusColors.ok, 20),
} as const;

/** Home dashboard — live issue metrics from the current database. */
export default function HomePage() {
  const { t, locale } = useI18n();
  const { has } = useAuth();
  const canIssues = has(Perm.IssueView);
  const canVehicles = has(Perm.VehicleView);
  const navigate = useNavigate();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [vehicles, setVehicles] = useState<VehicleSeverityBreakdown[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [overview, setOverview] = useState<HomeOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [stationRange, setStationRange] = useState<'7d' | '30d' | 'all'>('7d');

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const issueReq = canIssues
        ? api.listIssues()
        : Promise.resolve({ items: [] as Issue[] });
      const vehicleReq = canIssues
        ? api.vehicleSeverityBreakdown({})
        : Promise.resolve({ items: [] as VehicleSeverityBreakdown[] });
      const stationReq = canVehicles
        ? api.listStations()
        : Promise.resolve({ items: [] as Station[] });
      const overviewReq = canVehicles
        ? api.homeOverview()
        : Promise.resolve(null);
      const [issueRes, vehicleRes, stationRes, overviewRes] = await Promise.all([
        issueReq,
        vehicleReq,
        stationReq,
        overviewReq,
      ]);
      setIssues(issueRes.items ?? []);
      setVehicles(vehicleRes.items ?? []);
      setStations(stationRes.items ?? []);
      setOverview(overviewRes);
      const stamp = new Date();
      setUpdatedAt(stamp);
      setNow(stamp);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('home.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [canIssues, canVehicles, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const metrics = useMemo(
    () => buildHomeDashboard(issues, vehicles, stations, new Date(), localeTag(locale)),
    [issues, vehicles, stations, locale],
  );

  const stationSince = useMemo(() => {
    if (stationRange === 'all') return undefined;
    const days = stationRange === '7d' ? 7 : 30;
    return addLocalDays(new Date(), -(days - 1)).getTime();
  }, [stationRange, updatedAt]);

  const rangedStationOpen = useMemo(
    () =>
      openIssuesByStation(issues, stations, stationSince).map((row) => {
        if (row.station === 'Unknown') {
          return { ...row, station: t('home.unknownStation') };
        }
        const fallback = /^Station (\d+)$/.exec(row.station);
        if (fallback) {
          return { ...row, station: t('analysis.stationN', { id: fallback[1] }) };
        }
        return row;
      }),
    [issues, stations, stationSince, t],
  );

  const openByStation = useMemo(
    () =>
      metrics.openByStation.map((row) => {
        if (row.station === 'Unknown') {
          return { ...row, station: t('home.unknownStation') };
        }
        const fallback = /^Station (\d+)$/.exec(row.station);
        if (fallback) {
          return { ...row, station: t('analysis.stationN', { id: fallback[1] }) };
        }
        return row;
      }),
    [metrics.openByStation, t],
  );

  const openSeverity = useMemo(
    () =>
      metrics.openSeverity.map((entry) => ({
        ...entry,
        name:
          entry.name === 'Critical'
            ? t('severity.critical')
            : entry.name === 'Medium'
              ? t('severity.medium')
              : entry.name === 'Low'
                ? t('severity.low')
                : entry.name,
      })),
    [metrics.openSeverity, t],
  );

  const eolStages = overview?.EOLStages ?? [];
  const eolTotal = eolStages.reduce((sum, row) => sum + row.Count, 0);
  const eolCompleted = eolStages.find((s) => s.Stage === 'COMPLETED')?.Count ?? 0;
  const eolCompletePct = eolTotal === 0 ? 0 : Math.round((eolCompleted / eolTotal) * 100);
  const checklist = overview?.EOLChecklist ?? [];
  const checkDone = checklist.reduce((s, r) => s + r.Done, 0);
  const checkTotal = checklist.reduce((s, r) => s + r.Total, 0);
  const checkPct = checkTotal === 0 ? 0 : Math.round((checkDone / checkTotal) * 100);
  const donutData = [
    { name: 'done', value: checkDone, color: statusColors.ok },
    { name: 'rest', value: Math.max(checkTotal - checkDone, 0), color: statusColors.severityEmpty },
  ];

  const clock = now.toLocaleString(localeTag(locale), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const updatedClock = updatedAt
    ? updatedAt.toLocaleTimeString(localeTag(locale), {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : t('common.emDash');

  return (
    <section className="home-dashboard">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold sm:text-xl">{t('home.title')}</h1>
          <p className="mt-0.5 text-[12px]" style={mutedCaption}>
            {t('home.subtitle')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[12px]" style={mutedCaption}>
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays size={15} aria-hidden />
            {clock}
          </span>
          <span>{t('home.lastUpdated', { time: updatedClock })}</span>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--status-ok)] hover:bg-[var(--bg-surface-2)]"
            aria-label={t('home.refresh')}
            title={t('home.refresh')}
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : undefined} />
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-2 text-[13px]" style={{ color: 'var(--status-not-ok)' }}>
          {error}
        </p>
      )}

      {loading && !error && (
        <p className="mt-2 text-[13px]" style={mutedCaption}>
          {t('home.metricsLoading')}
        </p>
      )}

      {canIssues && (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title={t('home.stat.open')}
            value={metrics.openNow}
            previous={metrics.openPrev}
            icon={<AlertCircle size={16} />}
            accent={muteColor(statusColors.issueOpen, 40)}
            spark={metrics.sparkOpen}
            to="/issues?homeStat=open"
          />
          <StatCard
            title={t('home.stat.inProgress')}
            value={metrics.inProgressNow}
            previous={metrics.inProgressPrev}
            icon={<Timer size={16} />}
            accent={statusColors.issueInProgress}
            spark={metrics.sparkInProgress}
            to="/issues?homeStat=in_progress"
          />
          <StatCard
            title={t('home.stat.pendingQuality')}
            value={metrics.pendingQualityNow}
            previous={metrics.pendingQualityPrev}
            icon={<BadgeCheck size={16} />}
            accent={statusColors.issueDone}
            spark={metrics.sparkPending}
            to="/issues?homeStat=pending_quality"
          />
          <StatCard
            title={t('home.stat.critical')}
            value={metrics.criticalNow}
            previous={metrics.criticalPrev}
            icon={<TriangleAlert size={16} />}
            accent={statusColors.severityCritical}
            spark={metrics.sparkCritical}
            to="/issues?homeStat=critical"
          />
        </div>
      )}

      {canVehicles && (
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <ChartCard
            title={t('home.productionTitle')}
            subtitle={t('home.productionHint')}
            icon={<Factory size={18} />}
          >
            {eolStages.length === 0 ? (
              <p className="text-[13px]" style={mutedCaption}>
                {t('home.productionEmpty')}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[22rem] text-left text-[13px]">
                  <thead>
                    <tr
                      className="border-b text-[11px] font-semibold uppercase tracking-wide"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                    >
                      <th className="pb-2 pr-3 font-semibold">{t('home.colStage')}</th>
                      <th className="pb-2 pr-3 text-right font-semibold">
                        {t('home.colVehicleCount')}
                      </th>
                      <th className="pb-2 font-semibold">{t('home.colCompletion')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eolStages.map((row) => {
                      const Icon =
                        STAGE_ICONS[row.Stage as keyof typeof STAGE_ICONS] ?? Building2;
                      const color =
                        STAGE_COLORS[row.Stage as keyof typeof STAGE_COLORS] ??
                        statusColors.info;
                      const pct =
                        eolTotal === 0 ? 0 : Math.round((row.Count / eolTotal) * 100);
                      return (
                        <tr
                          key={row.Stage}
                          className="border-b last:border-b-0"
                          style={{ borderColor: 'var(--border)' }}
                        >
                          <td className="py-2.5 pr-3">
                            <span className="inline-flex items-center gap-2 font-medium">
                              <span
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                                style={{
                                  backgroundColor: `color-mix(in srgb, ${color} 18%, transparent)`,
                                  color,
                                }}
                              >
                                <Icon size={14} />
                              </span>
                              {eolStageLabel(row.Stage, t)}
                            </span>
                          </td>
                          <td className="py-2.5 pr-3 text-right text-base font-semibold tabular-nums">
                            {row.Count}
                          </td>
                          <td className="py-2.5">
                            <div className="flex items-center gap-2">
                              <div
                                className="h-2 min-w-0 flex-1 overflow-hidden rounded-full"
                                style={{ backgroundColor: 'var(--bg-surface-2)' }}
                              >
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${Math.max(pct, row.Count > 0 ? 4 : 0)}%`,
                                    backgroundColor: color,
                                  }}
                                />
                              </div>
                              <span
                                className="w-10 shrink-0 text-right text-[12px] font-semibold tabular-nums"
                                style={mutedCaption}
                              >
                                {pct}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr
                      className="border-t font-semibold"
                      style={{ borderColor: 'var(--border)' }}
                    >
                      <td className="pt-2.5 pr-3">{t('home.colTotal')}</td>
                      <td className="pt-2.5 pr-3 text-right text-base tabular-nums">
                        {eolTotal}
                      </td>
                      <td className="pt-2.5 text-[13px] tabular-nums" style={mutedCaption}>
                        {t('home.productionComplete', { pct: eolCompletePct })}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
            <p className="mt-2 text-[11px]" style={mutedCaption}>
              {t('home.productionExcluded')}
            </p>
          </ChartCard>

          <ChartCard
            title={t('home.eolStatusTitle')}
            subtitle={t('home.eolStatusHint')}
            icon={<Gauge size={18} />}
          >
            <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
              <div className="chart-inert relative mx-auto h-[140px] w-[140px] shrink-0 sm:mx-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart tabIndex={-1}>
                    <Pie
                      data={donutData}
                      dataKey="value"
                      cx="50%"
                      cy="50%"
                      innerRadius="62%"
                      outerRadius="82%"
                      stroke="none"
                      isAnimationActive={false}
                      rootTabIndex={-1}
                    >
                      {donutData.map((entry) => (
                        <Cell
                          key={entry.name}
                          fill={entry.color}
                          style={{ outline: 'none' }}
                        />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xl font-semibold tabular-nums">{checkPct}%</span>
                  <span className="max-w-[5.5rem] text-center text-[10px] leading-tight" style={mutedCaption}>
                    {t('home.eolOverall')}
                  </span>
                </div>
              </div>
              <div className="min-w-0 flex-1 overflow-x-auto">
                <table className="w-full text-left text-[13px]">
                  <thead>
                    <tr
                      className="border-b text-[11px] font-semibold uppercase tracking-wide"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                    >
                      <th className="pb-2 pr-2 font-semibold">{t('home.colStage')}</th>
                      <th className="pb-2 pr-2 text-right font-semibold">
                        {t('home.colDoneTotal')}
                      </th>
                      <th className="pb-2 text-right font-semibold">{t('home.colRate')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {checklist.map((row) => {
                      const pct =
                        row.Total === 0 ? 0 : Math.round((row.Done / row.Total) * 100);
                      const color =
                        row.Phase === 'DEPOT' ? statusColors.ok : statusColors.info;
                      return (
                        <tr
                          key={row.Phase}
                          className="border-b"
                          style={{ borderColor: 'var(--border)' }}
                        >
                          <td className="py-2 pr-2">
                            <span className="inline-flex items-center gap-2 font-medium">
                              <span
                                className="h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: color }}
                              />
                              {eolStageLabel(row.Phase, t)}
                            </span>
                          </td>
                          <td className="py-2 pr-2 text-right tabular-nums font-semibold">
                            {t('home.eolItemsOf', { done: row.Done, total: row.Total })}
                          </td>
                          <td className="py-2 text-right tabular-nums font-semibold">
                            {pct}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr
                      className="border-t font-semibold"
                      style={{ borderColor: 'var(--border)' }}
                    >
                      <td className="pt-2.5 pr-2">{t('home.colTotal')}</td>
                      <td className="pt-2.5 pr-2 text-right tabular-nums">
                        {t('home.eolItemsOf', { done: checkDone, total: checkTotal })}
                      </td>
                      <td className="pt-2.5 text-right tabular-nums">{checkPct}%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </ChartCard>
        </div>
      )}

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        {canIssues && (
          <ChartCard
            title={t('home.stationOpenTitle')}
            subtitle={t('home.stationOpenHint')}
            icon={<BarChart3 size={18} />}
            action={
              <select
                value={stationRange}
                onChange={(e) => setStationRange(e.target.value as '7d' | '30d' | 'all')}
                className="rounded-lg border bg-[var(--bg-page)] px-2 py-1 text-[12px]"
                style={{ borderColor: 'var(--border)' }}
              >
                <option value="7d">{t('home.range7d')}</option>
                <option value="30d">{t('home.range30d')}</option>
                <option value="all">{t('home.rangeAll')}</option>
              </select>
            }
          >
            <div className="chart-inert h-[160px] w-full min-w-0">
              {rangedStationOpen.length === 0 ? (
                <p className="flex h-full items-center text-[13px]" style={mutedCaption}>
                  {t('home.noStationDefects')}
                </p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    tabIndex={-1}
                    data={rangedStationOpen}
                    margin={{ top: 4, right: 4, left: 0, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis
                      dataKey="station"
                      tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                      interval={0}
                    />
                    <YAxis
                      allowDecimals={false}
                      width={28}
                      tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                    />
                    <Tooltip
                      contentStyle={CHART_TOOLTIP}
                      formatter={(value: number) => [value, t('home.openIssue')]}
                    />
                    <Bar
                      dataKey="count"
                      fill={statusColors.notOk}
                      name={t('home.openIssue')}
                      radius={[6, 6, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </ChartCard>
        )}

        {canVehicles && (
          <ChartCard
            title={t('home.criticalVehiclesTitle')}
            subtitle={t('home.criticalVehiclesHint')}
            icon={<TriangleAlert size={18} />}
          >
            {(overview?.CriticalVehicles.length ?? 0) === 0 ? (
              <p className="py-4 text-[13px]" style={mutedCaption}>
                {t('home.noCriticalVehicles')}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[28rem] text-left text-[13px]">
                  <thead style={mutedCaption}>
                    <tr>
                      <th className="pb-1.5 font-medium">{t('home.colRank')}</th>
                      <th className="pb-1.5 font-medium">{t('home.colVehicle')}</th>
                      <th className="pb-1.5 font-medium">{t('home.colCriticalCount')}</th>
                      <th className="pb-1.5 font-medium">{t('home.colSeverity')}</th>
                      <th className="pb-1.5 font-medium">{t('home.colStatus')}</th>
                      <th className="pb-1.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {overview?.CriticalVehicles.map((row, i) => {
                      const href = `/vehicles/${encodeURIComponent(row.VIN)}?tab=issues`;
                      return (
                        <tr
                          key={row.VIN}
                          className="cursor-pointer border-t hover:bg-[var(--bg-surface-2)]"
                          style={{ borderColor: 'var(--border)' }}
                          onClick={() => navigate(href)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              navigate(href);
                            }
                          }}
                          tabIndex={0}
                          role="link"
                        >
                          <td className="py-1.5 tabular-nums" style={mutedCaption}>
                            {i + 1}
                          </td>
                          <td className="py-1.5 font-mono font-medium">
                            …{row.VIN.slice(-6)}
                          </td>
                          <td className="py-1.5 tabular-nums">{row.CriticalCount}</td>
                          <td className="py-1.5">
                            <SeverityIndicator severity={row.WorstSeverity} />
                          </td>
                          <td className="py-1.5">
                            <StatusBadge kind="vehicle" value={row.Status} />
                          </td>
                          <td className="py-1.5 text-right text-[var(--text-secondary)]">
                            <ChevronRight size={16} aria-hidden />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </ChartCard>
        )}
      </div>

      {canVehicles && (
        <ChartCard
          className="mt-3"
          title={t('home.activityTitle')}
          subtitle={t('home.activityHint')}
          icon={<History size={18} />}
          action={
            canIssues ? (
              <Link
                to="/issues"
                className="text-[12px] font-medium text-[var(--accent)] hover:underline"
              >
                {t('home.activitySeeAll')}
              </Link>
            ) : null
          }
        >
          {(overview?.Activity.length ?? 0) === 0 ? (
            <p className="py-4 text-[13px]" style={mutedCaption}>
              {t('home.activityEmpty')}
            </p>
          ) : (
            <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {overview?.Activity.map((row, i) => {
                const meta = activityMeta(row.EventType, row.NewValue, t);
                return (
                  <li
                    key={`${row.EventAt}-${i}`}
                    className="flex flex-wrap items-center gap-3 py-2 text-[13px]"
                  >
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                      style={{
                        color: meta.color,
                        backgroundColor: `color-mix(in srgb, ${meta.color} 16%, transparent)`,
                      }}
                    >
                      {meta.icon}
                    </span>
                    <span className="w-14 tabular-nums" style={mutedCaption}>
                      {new Date(row.EventAt).toLocaleTimeString(localeTag(locale), {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    <span className="min-w-[7rem] font-medium">{meta.label}</span>
                    <span className="font-mono text-[var(--accent)]">…{row.VIN.slice(-6)}</span>
                    <span className="min-w-0 flex-1 truncate" style={mutedCaption}>
                      {row.OldValue && row.NewValue
                        ? `${row.OldValue} → ${row.NewValue}`
                        : row.NewValue || row.OldValue}
                    </span>
                    <span className="truncate" style={mutedCaption}>
                      {row.ActorEmail || row.ActorName || t('common.emDash')}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </ChartCard>
      )}
      {canIssues && (
        <>
      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <ChartCard
          title={t('home.severityDist')}
          subtitle={t('home.severityHint')}
          icon={<Layers size={18} />}
        >
          <div className="chart-inert h-[180px] w-full min-w-0 sm:h-[200px]">
            {metrics.openNow === 0 ? (
              <p className="flex h-full items-center text-[13px]" style={mutedCaption}>
                {t('home.noOpenIssues')}
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart tabIndex={-1}>
                  <Pie
                    data={openSeverity}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius="48%"
                    outerRadius="72%"
                    paddingAngle={2}
                    stroke="none"
                    isAnimationActive={false}
                    rootTabIndex={-1}
                    style={{ outline: 'none', cursor: 'default' }}
                  >
                    {openSeverity.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={entry.color}
                        style={{ outline: 'none', cursor: 'default' }}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={CHART_TOOLTIP}
                    formatter={(value: number, name: string) => [value, name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </ChartCard>

        <ChartCard
          title={t('home.openByStation')}
          subtitle={t('home.openByStationHint')}
          icon={<MapPin size={18} />}
        >
          <div className="chart-inert h-[160px] w-full min-w-0 sm:h-[180px]">
            {openByStation.length === 0 ? (
              <p className="flex h-full items-center text-[13px]" style={mutedCaption}>
                {t('home.noStationDefects')}
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  tabIndex={-1}
                  data={openByStation}
                  layout="vertical"
                  margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                  />
                  <YAxis
                    type="category"
                    dataKey="station"
                    width={88}
                    tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                  />
                  <Tooltip
                    contentStyle={CHART_TOOLTIP}
                    formatter={(value: number) => [value, t('home.openIssue')]}
                  />
                  <Bar
                    dataKey="count"
                    fill={brandColors.secondary}
                    fillOpacity={0.78}
                    name={t('home.openIssue')}
                    radius={[0, 6, 6, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </ChartCard>

        <ChartCard
          title={t('home.mttr')}
          subtitle={t('home.mttrHint')}
          icon={<Timer size={18} />}
        >
          <p className="text-2xl font-semibold tabular-nums text-[var(--text-primary)]">
            {metrics.mttrHours == null ? t('common.emDash') : formatMttr(metrics.mttrHours, t)}
          </p>
          <p className="mt-1.5 text-[12px]" style={mutedCaption}>
            {metrics.mttrSample === 0
              ? t('home.mttrEmpty')
              : t('home.mttrSample', { n: metrics.mttrSample })}
          </p>
        </ChartCard>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <ChartCard
          title={t('home.weekly')}
          subtitle={t('home.weeklyHint')}
          icon={<CalendarDays size={18} />}
        >
          <div className="chart-inert h-[160px] w-full min-w-0 sm:h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                tabIndex={-1}
                data={metrics.weekly}
                margin={{ top: 4, right: 4, left: 0, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="label"
                  tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                  interval={0}
                />
                <YAxis
                  allowDecimals={false}
                  width={32}
                  tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                />
                <Tooltip
                  contentStyle={CHART_TOOLTIP}
                  formatter={(value: number) => [value, t('home.reported')]}
                />
                <Bar
                  dataKey="count"
                  fill={brandColors.neutralWarm}
                  fillOpacity={0.92}
                  name={t('home.reported')}
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title={t('home.backlog')}
          subtitle={t('home.backlogHint')}
          icon={<TrendingUp size={18} />}
        >
          <div className="chart-inert h-[160px] w-full min-w-0 sm:h-[180px]">
            {metrics.backlog.length === 0 ? (
              <p className="flex h-full items-center text-[13px]" style={mutedCaption}>
                {t('home.noRecords')}
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  tabIndex={-1}
                  data={metrics.backlog}
                  margin={{ top: 8, right: 8, left: 0, bottom: 8 }}
                >
                  <defs>
                    <linearGradient id="homeBacklogFill" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="0%"
                        stopColor={brandColors.secondary}
                        stopOpacity={0.28}
                      />
                      <stop
                        offset="100%"
                        stopColor={brandColors.secondary}
                        stopOpacity={0.03}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                    minTickGap={36}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    allowDecimals={false}
                    width={32}
                    tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                  />
                  <Tooltip
                    contentStyle={CHART_TOOLTIP}
                    formatter={(value: number) => [value, t('home.backlogSeries')]}
                  />
                  <Area
                    type="monotone"
                    dataKey="open"
                    name={t('home.backlogSeries')}
                    stroke={brandColors.secondary}
                    fill="url(#homeBacklogFill)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </ChartCard>
      </div>
        </>
      )}
    </section>
  );
}

function StatCard({
  title,
  value,
  previous,
  icon,
  accent,
  spark,
  to,
}: {
  title: string;
  value: number;
  previous: number;
  icon: ReactNode;
  accent: string;
  spark: DayCount[];
  to: `/issues?homeStat=${HomeIssueStatKey}`;
}) {
  const { t } = useI18n();
  const polarity = deltaPolarity(value, previous);
  const color = deltaColor(polarity);
  const delta = formatAbsDelta(value, previous);

  return (
    <Link
      to={to}
      className="rounded-xl border bg-[var(--bg-surface-1)] px-3.5 py-3 transition-colors hover:bg-[var(--bg-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      style={{ borderColor: 'var(--border)' }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-[12px] font-medium leading-snug" style={mutedCaption}>
          {title}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-full"
            style={{
              color: accent,
              backgroundColor: `color-mix(in srgb, ${accent} 16%, transparent)`,
            }}
          >
            {icon}
          </div>
          <div className="h-8 w-16">
            <div className="chart-inert h-full w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={spark}
                  tabIndex={-1}
                  margin={{ top: 2, right: 0, left: 0, bottom: 2 }}
                >
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke={accent}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums leading-none text-[var(--text-primary)]">
        {value}
      </p>
      <p className="mt-1.5 inline-flex items-center gap-1 text-[11px]" style={mutedCaption}>
        {t('home.vsLast24h')}
        <DeltaBadge polarity={polarity} color={color} label={delta} />
      </p>
    </Link>
  );
}

function DeltaBadge({
  polarity,
  color,
  label,
}: {
  polarity: DeltaPolarity;
  color: string;
  label: string;
}) {
  const Icon =
    polarity === 'up' ? TrendingUp : polarity === 'down' ? TrendingDown : null;
  return (
    <span
      className="inline-flex items-center gap-0.5 text-[12px] font-semibold tabular-nums"
      style={{ color }}
    >
      {Icon && <Icon size={12} strokeWidth={2.5} />}
      {label}
    </span>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
  className = '',
  action,
  icon,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div
      className={`min-w-0 overflow-hidden rounded-xl border bg-[var(--bg-surface-1)] p-3 sm:p-3.5 ${className}`}
      style={{ borderColor: 'var(--border)' }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold leading-tight sm:text-base">
            {icon ? (
              <span
                className="inline-flex shrink-0 text-[var(--accent)]"
                aria-hidden
              >
                {icon}
              </span>
            ) : null}
            <span className="min-w-0">{title}</span>
          </h2>
          {subtitle && (
            <p className="mt-0.5 text-[12px] leading-snug" style={mutedCaption}>
              {subtitle}
            </p>
          )}
        </div>
        {action}
      </div>
      <div className="mt-2.5">{children}</div>
    </div>
  );
}

function activityMeta(
  eventType: string,
  newValue: string,
  t: ReturnType<typeof useI18n>['t'],
): { label: string; color: string; icon: ReactNode } {
  const nv = newValue.toUpperCase();
  if (eventType === 'ISSUE_STATUS_CHANGE') {
    if (nv === 'DONE') {
      return { label: t('home.activity.issueDone'), color: statusColors.ok, icon: <CheckCircle2 size={16} /> };
    }
    if (nv === 'IN_PROGRESS') {
      return { label: t('home.activity.issueProgress'), color: statusColors.issueInProgress, icon: <Timer size={16} /> };
    }
    if (nv === 'APPROVED' || nv === 'CONDITIONAL_APPROVED') {
      return { label: t('home.activity.qualityApproved'), color: statusColors.info, icon: <BadgeCheck size={16} /> };
    }
    if (nv === 'OPEN') {
      return { label: t('home.activity.issueCreated'), color: statusColors.notOk, icon: <AlertCircle size={16} /> };
    }
  }
  if (eventType === 'STATUS_CHANGE') {
    if (nv === 'IN_WAREHOUSE') {
      return { label: t('home.activity.warehouse'), color: statusColors.vehicleInWarehouse, icon: <Warehouse size={16} /> };
    }
    if (nv === 'DELIVERED' || nv === 'WITH_CUSTOMER') {
      return { label: t('home.activity.delivered'), color: statusColors.ok, icon: <CheckCircle2 size={16} /> };
    }
    return { label: t('home.activity.status'), color: statusColors.info, icon: <ClipboardCheck size={16} /> };
  }
  if (eventType === 'EOL_WORKFLOW_STAGE_CHANGE') {
    return { label: t('home.activity.eolStage'), color: statusColors.info, icon: <Building2 size={16} /> };
  }
  if (eventType === 'CHECKLIST_ITEM_UPDATE') {
    return { label: t('home.activity.checklist'), color: statusColors.ok, icon: <ClipboardCheck size={16} /> };
  }
  if (eventType === 'MEDIA_UPLOADED') {
    return { label: t('home.activity.media'), color: statusColors.info, icon: <ClipboardCheck size={16} /> };
  }
  return { label: t('home.activity.other'), color: statusColors.pending, icon: <AlertCircle size={16} /> };
}
