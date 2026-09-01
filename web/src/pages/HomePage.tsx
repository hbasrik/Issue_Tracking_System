import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  BadgeCheck,
  CheckCircle2,
  ShieldAlert,
  Timer,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  api,
  type Issue,
  type Station,
  type VehicleSeverityBreakdown,
} from '../lib/api';
import {
  buildHomeDashboard,
  deltaColor,
  deltaPolarity,
  formatMttr,
  formatPercentDelta,
  muteColor,
  type DeltaPolarity,
} from '../lib/homeDashboard';
import type { HomeIssueStatKey } from '../lib/homeIssueStats';
import { severityFillColor } from '../components/SeverityIndicator';
import { brandColors, statusColors } from '../theme/tokens';
import { useI18n } from '../i18n';
import { localeTag } from '../../../shared/i18n';

const CHART_TOOLTIP = {
  background: 'var(--bg-surface-1)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  color: 'var(--text-primary)',
  fontSize: 12,
};

const mutedCaption = { color: 'var(--text-secondary)' } as const;

/** Home dashboard — live issue metrics from the current database. */
export default function HomePage() {
  const { t, locale } = useI18n();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [vehicles, setVehicles] = useState<VehicleSeverityBreakdown[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [issueRes, vehicleRes, stationRes] = await Promise.all([
          api.listIssues(),
          api.vehicleSeverityBreakdown({}),
          api.listStations(),
        ]);
        if (cancelled) return;
        setIssues(issueRes.items ?? []);
        setVehicles(vehicleRes.items ?? []);
        setStations(stationRes.items ?? []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t('home.loadFailed'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const metrics = useMemo(
    () => buildHomeDashboard(issues, vehicles, stations, new Date(), localeTag(locale)),
    [issues, vehicles, stations, locale],
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

  return (
    <section>
      <h1 className="text-xl font-semibold sm:text-2xl">{t('home.title')}</h1>
      <p className="mt-1 text-[13px]" style={mutedCaption}>
        {t('home.subtitle')}
      </p>

      {error && (
        <p className="mt-4 text-[13px]" style={{ color: 'var(--status-not-ok)' }}>
          {error}
        </p>
      )}

      {loading && !error && (
        <p className="mt-4 text-[13px]" style={mutedCaption}>
          {t('home.metricsLoading')}
        </p>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          title={t('home.stat.open')}
          value={metrics.openNow}
          previous={metrics.openPrev}
          icon={<AlertCircle size={20} />}
          accent={muteColor(statusColors.issueOpen, 40)}
          to="/issues?homeStat=open"
        />
        <StatCard
          title={t('home.stat.closedToday')}
          value={metrics.closedToday}
          previous={metrics.closedPrevDay}
          icon={<CheckCircle2 size={20} />}
          accent={statusColors.issueDone}
          to="/issues?homeStat=closed_today"
        />
        <StatCard
          title={t('home.stat.inProgress')}
          value={metrics.inProgressNow}
          previous={metrics.inProgressPrev}
          icon={<Timer size={20} />}
          accent={statusColors.issueInProgress}
          to="/issues?homeStat=in_progress"
        />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard
          title={t('home.stat.conditionalToday')}
          value={metrics.conditionalToday}
          previous={metrics.conditionalPrevDay}
          icon={<ShieldAlert size={20} />}
          accent={statusColors.issueConditionalApproved}
          to="/issues?homeStat=conditional_approved_today"
        />
        <StatCard
          title={t('home.stat.approvedToday')}
          value={metrics.approvedToday}
          previous={metrics.approvedPrevDay}
          icon={<BadgeCheck size={20} />}
          accent={statusColors.issueResolved}
          to="/issues?homeStat=approved_today"
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-5">
        <ChartCard
          className="lg:col-span-3"
          title={t('home.topVehicles')}
          subtitle={t('home.topVehiclesHint')}
        >
          {metrics.topVehicles.length === 0 ? (
            <p className="py-8 text-[13px]" style={mutedCaption}>
              {t('home.noTopVehicles')}
            </p>
          ) : (
            <ol className="space-y-3">
              {metrics.topVehicles.map((row) => {
                const raw = severityFillColor(row.worstSeverity);
                const color =
                  row.worstSeverity === 'LOW' ? raw : muteColor(raw, 38);
                return (
                  <li key={row.vin} className="flex items-center gap-3">
                    <span
                      className="w-5 shrink-0 text-right text-[13px] tabular-nums"
                      style={mutedCaption}
                    >
                      {row.rank}
                    </span>
                    <Link
                      to={`/vehicles/${encodeURIComponent(row.vin)}?tab=issues`}
                      className="w-16 shrink-0 font-mono text-[13px] font-medium text-[var(--accent)] hover:underline"
                      title={row.vin}
                    >
                      …{row.vinTail}
                    </Link>
                    <div
                      className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full"
                      style={{ backgroundColor: 'var(--bg-surface-2)' }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.max(row.barPct, 4)}%`,
                          backgroundColor: color,
                        }}
                      />
                    </div>
                    <span
                      className="min-w-[2.25rem] rounded-full px-2 py-0.5 text-center text-[12px] font-semibold tabular-nums"
                      style={{
                        color,
                        backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)`,
                      }}
                    >
                      {row.openCount}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </ChartCard>

        <ChartCard
          className="lg:col-span-2"
          title={t('home.resolutionRate')}
          subtitle={t('home.resolutionHint')}
        >
          <ResolutionGauge
            rate={metrics.resolutionRate}
            resolved={metrics.resolvedCount}
            total={metrics.totalCount}
          />
        </ChartCard>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard
          title={t('home.severityDist')}
          subtitle={t('home.severityHint')}
        >
          <div className="h-[220px] w-full min-w-0 sm:h-[240px]">
            {metrics.openNow === 0 ? (
              <p className="flex h-full items-center text-[13px]" style={mutedCaption}>
                {t('home.noOpenIssues')}
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
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
                  >
                    {openSeverity.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
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
        >
          <div className="h-[220px] w-full min-w-0 sm:h-[240px]">
            {openByStation.length === 0 ? (
              <p className="flex h-full items-center text-[13px]" style={mutedCaption}>
                {t('home.noStationDefects')}
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
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
        >
          <p className="text-3xl font-semibold tabular-nums text-[var(--text-primary)]">
            {metrics.mttrHours == null ? t('common.emDash') : formatMttr(metrics.mttrHours, t)}
          </p>
          <p className="mt-2 text-[13px]" style={mutedCaption}>
            {metrics.mttrSample === 0
              ? t('home.mttrEmpty')
              : t('home.mttrSample', { n: metrics.mttrSample })}
          </p>
        </ChartCard>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title={t('home.weekly')}
          subtitle={t('home.weeklyHint')}
        >
          <div className="h-[220px] w-full min-w-0 sm:h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={metrics.weekly}
                margin={{ top: 8, right: 8, left: 0, bottom: 8 }}
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
        >
          <div className="h-[220px] w-full min-w-0 sm:h-[260px]">
            {metrics.backlog.length === 0 ? (
              <p className="flex h-full items-center text-[13px]" style={mutedCaption}>
                {t('home.noRecords')}
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
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
    </section>
  );
}

function StatCard({
  title,
  value,
  previous,
  icon,
  accent,
  to,
}: {
  title: string;
  value: number;
  previous: number;
  icon: ReactNode;
  accent: string;
  to: `/issues?homeStat=${HomeIssueStatKey}`;
}) {
  const { t } = useI18n();
  const polarity = deltaPolarity(value, previous);
  const color = deltaColor(polarity);
  const delta = formatPercentDelta(value, previous);

  return (
    <Link
      to={to}
      className="rounded-xl border bg-[var(--bg-surface-1)] p-5 transition-colors hover:bg-[var(--bg-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      style={{ borderColor: 'var(--border)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-lg"
          style={{
            color: accent,
            backgroundColor: `color-mix(in srgb, ${accent} 14%, transparent)`,
          }}
        >
          {icon}
        </div>
        <DeltaBadge polarity={polarity} color={color} label={delta} />
      </div>
      <p className="mt-4 text-[13px]" style={mutedCaption}>
        {title}
      </p>
      <p className="mt-1 text-3xl font-semibold tabular-nums text-[var(--text-primary)]">
        {value}
      </p>
      <p className="mt-1 text-[12px]" style={mutedCaption}>
        {t('home.hoursAgo', { n: previous })}
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
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`min-w-0 overflow-hidden rounded-xl border bg-[var(--bg-surface-1)] p-4 sm:p-5 ${className}`}
      style={{ borderColor: 'var(--border)' }}
    >
      <h2 className="text-base font-semibold sm:text-lg">{title}</h2>
      {subtitle && (
        <p className="mt-1 text-[13px]" style={mutedCaption}>
          {subtitle}
        </p>
      )}
      <div className="mt-4">{children}</div>
    </div>
  );
}

function ResolutionGauge({
  rate,
  resolved,
  total,
}: {
  rate: number;
  resolved: number;
  total: number;
}) {
  const { t } = useI18n();
  const pct = Math.round(rate * 100);
  const r = 78;
  const cx = 100;
  const cy = 96;
  const track = Math.PI * r;
  const dash = rate * track;
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 120" className="w-full max-w-[280px]" aria-hidden>
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke={statusColors.severityEmpty}
          strokeWidth={14}
          strokeLinecap="round"
        />
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke={muteColor(statusColors.ok, 12)}
          strokeWidth={14}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${track}`}
        />
        <text
          x={cx}
          y={cy - 8}
          textAnchor="middle"
          fill="var(--text-primary)"
          fontSize="32"
          fontWeight={600}
        >
          {pct}%
        </text>
      </svg>
      <p className="mt-1 text-[13px]" style={mutedCaption}>
        {t('home.resolvedOfTotal', { resolved, total })}
      </p>
    </div>
  );
}
