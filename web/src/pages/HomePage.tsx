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
          setError(err instanceof Error ? err.message : 'Failed to load dashboard');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const metrics = useMemo(
    () => buildHomeDashboard(issues, vehicles, stations),
    [issues, vehicles, stations],
  );

  return (
    <section>
      <h1 className="text-xl font-semibold sm:text-2xl">Dashboard</h1>
      <p className="mt-1 text-[13px]" style={mutedCaption}>
        Canlı hata metrikleri — son 24 saat ve dönemsel trend
      </p>

      {error && (
        <p className="mt-4 text-[13px]" style={{ color: 'var(--status-not-ok)' }}>
          {error}
        </p>
      )}

      {loading && !error && (
        <p className="mt-4 text-[13px]" style={mutedCaption}>
          Metrikler yükleniyor…
        </p>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          title="Toplam Açık Hata"
          value={metrics.openNow}
          previous={metrics.openPrev}
          upIsBad
          icon={<AlertCircle size={20} />}
          accent={muteColor(statusColors.issueOpen, 40)}
          to="/issues?homeStat=open"
        />
        <StatCard
          title="Bugün Kapanan"
          value={metrics.closedToday}
          previous={metrics.closedPrevDay}
          upIsBad={false}
          icon={<CheckCircle2 size={20} />}
          accent={statusColors.issueDone}
          to="/issues?homeStat=closed_today"
        />
        <StatCard
          title="İşlemde"
          value={metrics.inProgressNow}
          previous={metrics.inProgressPrev}
          upIsBad
          icon={<Timer size={20} />}
          accent={statusColors.issueInProgress}
          to="/issues?homeStat=in_progress"
        />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard
          title="Şartlı Onay (Bugün)"
          value={metrics.conditionalToday}
          previous={metrics.conditionalPrevDay}
          upIsBad={false}
          icon={<ShieldAlert size={20} />}
          accent={statusColors.issueConditionalApproved}
          to="/issues?homeStat=conditional_approved_today"
        />
        <StatCard
          title="Kalite Onay (Bugün)"
          value={metrics.approvedToday}
          previous={metrics.approvedPrevDay}
          upIsBad={false}
          icon={<BadgeCheck size={20} />}
          accent={statusColors.issueResolved}
          to="/issues?homeStat=approved_today"
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-5">
        <ChartCard
          className="lg:col-span-3"
          title="En Çok Hatalı Araçlar"
          subtitle="Açık hata sayısına göre ilk 8 — çubuk, listedeki en yüksek sayıya oranlı"
        >
          {metrics.topVehicles.length === 0 ? (
            <p className="py-8 text-[13px]" style={mutedCaption}>
              Açık hatalı araç yok
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
          title="Çözüm Oranı"
          subtitle="Kalite Onay + Şartlı Onay / tüm hatalar"
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
          title="Severity Dağılımı"
          subtitle="Açık hataların Critical / Medium / Low kırılımı"
        >
          <div className="h-[220px] w-full min-w-0 sm:h-[240px]">
            {metrics.openNow === 0 ? (
              <p className="flex h-full items-center text-[13px]" style={mutedCaption}>
                Açık hata yok
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={metrics.openSeverity}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius="48%"
                    outerRadius="72%"
                    paddingAngle={2}
                    stroke="none"
                  >
                    {metrics.openSeverity.map((entry) => (
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
          title="İstasyon Bazlı Açık Hata"
          subtitle="Hangi istasyonda kaç açık hata var"
        >
          <div className="h-[220px] w-full min-w-0 sm:h-[240px]">
            {metrics.openByStation.length === 0 ? (
              <p className="flex h-full items-center text-[13px]" style={mutedCaption}>
                Açık hata yok
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={metrics.openByStation}
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
                    formatter={(value: number) => [value, 'Açık hata']}
                  />
                  <Bar
                    dataKey="count"
                    fill={brandColors.secondary}
                    fillOpacity={0.78}
                    name="Açık hata"
                    radius={[0, 6, 6, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </ChartCard>

        <ChartCard
          title="Ortalama Çözüm Süresi"
          subtitle="Bildirimden Kalite Onay / Şartlı Onay’a"
        >
          <p className="text-3xl font-semibold tabular-nums text-[var(--text-primary)]">
            {metrics.mttrHours == null ? '—' : formatMttr(metrics.mttrHours)}
          </p>
          <p className="mt-2 text-[13px]" style={mutedCaption}>
            {metrics.mttrSample === 0
              ? 'Henüz kapanmış hata yok'
              : `${metrics.mttrSample} kapanmış hata üzerinden`}
          </p>
        </ChartCard>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Haftalık Bildirilen Hatalar"
          subtitle="Son 7 günde bildirilen hatalar"
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
                  formatter={(value: number) => [value, 'Bildirilen']}
                />
                <Bar
                  dataKey="count"
                  fill={brandColors.neutralWarm}
                  fillOpacity={0.92}
                  name="Bildirilen"
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title="Açık Hata Stoğu"
          subtitle="Gün sonu açık hata sayısı — son 90 gün veya ilk hatadan beri"
        >
          <div className="h-[220px] w-full min-w-0 sm:h-[260px]">
            {metrics.backlog.length === 0 ? (
              <p className="flex h-full items-center text-[13px]" style={mutedCaption}>
                Henüz hata kaydı yok
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
                    formatter={(value: number) => [value, 'Açık stok']}
                  />
                  <Area
                    type="monotone"
                    dataKey="open"
                    name="Açık stok"
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
  upIsBad,
  icon,
  accent,
  to,
}: {
  title: string;
  value: number;
  previous: number;
  upIsBad: boolean;
  icon: ReactNode;
  accent: string;
  to: `/issues?homeStat=${HomeIssueStatKey}`;
}) {
  const polarity = deltaPolarity(value, previous, upIsBad);
  const color = deltaColor(polarity);
  const delta = formatPercentDelta(value, previous);
  const up = value > previous;

  return (
    <Link
      to={to}
      className="rounded-xl border bg-[var(--bg-surface-1)] p-5 transition-colors hover:bg-[var(--bg-surface-2)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
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
        <DeltaBadge polarity={polarity} color={color} up={up} label={delta} />
      </div>
      <p className="mt-4 text-[13px]" style={mutedCaption}>
        {title}
      </p>
      <p className="mt-1 text-3xl font-semibold tabular-nums text-[var(--text-primary)]">
        {value}
      </p>
      <p className="mt-1 text-[12px]" style={mutedCaption}>
        24 saat önce: {previous}
      </p>
    </Link>
  );
}

function DeltaBadge({
  polarity,
  color,
  up,
  label,
}: {
  polarity: DeltaPolarity;
  color: string;
  up: boolean;
  label: string;
}) {
  const Icon =
    polarity === 'neutral' ? null : up ? TrendingUp : TrendingDown;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold tabular-nums"
      style={{
        color,
        backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`,
      }}
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
        {resolved} / {total} hata kapanmış
      </p>
    </div>
  );
}
