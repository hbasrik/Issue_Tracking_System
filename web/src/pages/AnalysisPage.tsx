import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  BadgeCheck,
  BarChart3,
  Building2,
  CalendarDays,
  ClipboardList,
  Download,
  Factory,
  Gauge,
  Info,
  Layers,
  RefreshCw,
  Timer,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Truck,
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
  type AnalysisDashboard,
  type AnalysisKPICards,
  type Station,
} from '../lib/api';
import { buildAnalysisCsv } from '../lib/analysisExport';
import { VinSearchBox } from '../components/VinSearchBox';
import { SeverityIndicator, severityFillColor } from '../components/SeverityIndicator';
import { issueStatusColor, issueStatusLabel } from '../lib/issueStatus';
import {
  deltaColor,
  deltaPolarity,
  formatAbsDelta,
  formatPercentDelta,
  rankTopVehicles,
  type DayCount,
  type DeltaPolarity,
} from '../lib/homeDashboard';
import { downloadBlob } from '../lib/issueExport';
import { statusColors } from '../theme/tokens';
import { useI18n } from '../i18n';
import {
  VEHICLE_STATUS_FILTER_VALUES,
  eolStageLabel,
  vehicleStatusLabel,
} from '../lib/vehicleStatus';

const VEHICLE_STATUSES = ['', ...VEHICLE_STATUS_FILTER_VALUES] as const;
const SEVERITIES = ['', 'CRITICAL', 'MEDIUM', 'LOW'] as const;
const EOL_STAGES = ['', 'BRANCH', 'DEPOT', 'COMPLETED'] as const;
const COMPARE_MODES = ['', 'previous_period', 'previous_week', 'previous_month'] as const;

const DONUT_START_ANGLE = 90;
const CHART_TOOLTIP = {
  backgroundColor: 'var(--bg-surface-2)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  fontSize: 12,
} as const;
const mutedCaption = { color: 'var(--text-secondary)' } as const;

const STAGE_COLORS: Record<string, string> = {
  BRANCH: statusColors.info,
  DEPOT: statusColors.issueInProgress,
  COMPLETED: statusColors.ok,
};

const AGE_BUCKET_KEYS = {
  '0-1': 'analysis.age.0_1',
  '1-3': 'analysis.age.1_3',
  '3-7': 'analysis.age.3_7',
  '7+': 'analysis.age.7plus',
} as const satisfies Record<string, 'analysis.age.0_1' | 'analysis.age.1_3' | 'analysis.age.3_7' | 'analysis.age.7plus'>;

type SparkKey = 'Production' | 'Opened' | 'Closed' | 'OpenStock';

/** Issue-level filters that some vehicle/workflow metrics intentionally ignore. */
type IssueFilterKind = 'severity' | 'issue_type' | 'station';

type AnalysisKpiTitleKey =
  | 'analysis.kpi.production'
  | 'analysis.kpi.open'
  | 'analysis.kpi.criticalOpen'
  | 'analysis.kpi.pendingQuality'
  | 'analysis.kpi.opened'
  | 'analysis.kpi.closed'
  | 'analysis.kpi.branchShipped'
  | 'analysis.kpi.delivered'
  | 'analysis.kpi.mttr'
  | 'analysis.kpi.fpy'
  | 'analysis.kpi.completion';

type KpiDef = {
  key: keyof AnalysisKPICards;
  titleKey: AnalysisKpiTitleKey;
  accent: string;
  icon: ReactNode;
  spark?: SparkKey;
  format?: (v: number | null) => string;
  invertDelta?: boolean;
  /** When set, show a note if any of these issue filters are active. */
  ignoresIssueFilters?: IssueFilterKind[];
};

/** Vehicle / EOL metrics — not scoped by issue severity, type, or station. */
const VEHICLE_METRIC_IGNORES: IssueFilterKind[] = [
  'severity',
  'issue_type',
  'station',
];

const KPI_DEFS: KpiDef[] = [
  {
    key: 'TotalProduction',
    titleKey: 'analysis.kpi.production',
    accent: statusColors.vehicleInProduction,
    icon: <Factory size={16} />,
    spark: 'Production',
    ignoresIssueFilters: VEHICLE_METRIC_IGNORES,
  },
  {
    key: 'OpenIssues',
    titleKey: 'analysis.kpi.open',
    accent: statusColors.issueOpen,
    icon: <AlertCircle size={16} />,
    spark: 'OpenStock',
    invertDelta: true,
  },
  {
    key: 'CriticalOpen',
    titleKey: 'analysis.kpi.criticalOpen',
    accent: statusColors.severityCritical,
    icon: <TriangleAlert size={16} />,
    invertDelta: true,
  },
  {
    key: 'PendingQuality',
    titleKey: 'analysis.kpi.pendingQuality',
    accent: statusColors.issueDone,
    icon: <BadgeCheck size={16} />,
    invertDelta: true,
  },
  {
    key: 'OpenedIssues',
    titleKey: 'analysis.kpi.opened',
    accent: statusColors.notOk,
    icon: <ClipboardList size={16} />,
    spark: 'Opened',
  },
  {
    key: 'ClosedIssues',
    titleKey: 'analysis.kpi.closed',
    accent: statusColors.ok,
    icon: <Gauge size={16} />,
    spark: 'Closed',
  },
  {
    key: 'BranchShipped',
    titleKey: 'analysis.kpi.branchShipped',
    accent: statusColors.vehicleShipped,
    icon: <Truck size={16} />,
    ignoresIssueFilters: VEHICLE_METRIC_IGNORES,
  },
  {
    key: 'Delivered',
    titleKey: 'analysis.kpi.delivered',
    accent: statusColors.vehicleWithCustomer,
    icon: <Building2 size={16} />,
    ignoresIssueFilters: VEHICLE_METRIC_IGNORES,
  },
  {
    key: 'AvgResolutionHours',
    titleKey: 'analysis.kpi.mttr',
    accent: statusColors.issueInProgress,
    icon: <Timer size={16} />,
    format: (v) => (v == null ? '—' : v.toFixed(2)),
  },
  {
    key: 'FirstTimeRightPercent',
    titleKey: 'analysis.kpi.fpy',
    accent: statusColors.issueDone,
    icon: <Layers size={16} />,
    format: (v) => (v == null ? '—' : `${v}%`),
    // Station applies; severity / issue type do not.
    ignoresIssueFilters: ['severity', 'issue_type'],
  },
  {
    key: 'CompletionPercent',
    titleKey: 'analysis.kpi.completion',
    accent: statusColors.info,
    icon: <BarChart3 size={16} />,
    format: (v) => (v == null ? '—' : `${v}%`),
    ignoresIssueFilters: VEHICLE_METRIC_IGNORES,
  },
];

export default function AnalysisPage() {
  const { t, locale } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();

  const [draftFrom, setDraftFrom] = useState(searchParams.get('from') ?? '');
  const [draftTo, setDraftTo] = useState(searchParams.get('to') ?? '');
  const [draftStation, setDraftStation] = useState(
    searchParams.get('station') ?? searchParams.get('phase') ?? '',
  );
  const [draftStatus, setDraftStatus] = useState(searchParams.get('status') ?? '');
  const [draftIssueType, setDraftIssueType] = useState(
    searchParams.get('issue_type') ?? '',
  );
  const [draftVin, setDraftVin] = useState(searchParams.get('vin_suffix') ?? '');
  const [draftSeverity, setDraftSeverity] = useState(searchParams.get('severity') ?? '');
  const [draftEolStage, setDraftEolStage] = useState(searchParams.get('eol_stage') ?? '');
  const [draftCompare, setDraftCompare] = useState(searchParams.get('compare') ?? '');

  const applied = useMemo(
    () => ({
      from: searchParams.get('from') ?? undefined,
      to: searchParams.get('to') ?? undefined,
      vin_suffix: searchParams.get('vin_suffix') ?? undefined,
      station: searchParams.get('station') ?? searchParams.get('phase') ?? undefined,
      status: searchParams.get('status') ?? undefined,
      issue_type: searchParams.get('issue_type') ?? undefined,
      severity: searchParams.get('severity') ?? undefined,
      eol_stage: searchParams.get('eol_stage') ?? undefined,
      compare: searchParams.get('compare') ?? undefined,
    }),
    [searchParams],
  );

  const activeIssueFilters = useMemo(() => {
    const out: IssueFilterKind[] = [];
    if (applied.severity) out.push('severity');
    if (applied.issue_type) out.push('issue_type');
    if (applied.station) out.push('station');
    return out;
  }, [applied]);

  const vehicleFilterNote = useMemo(
    () => filterUnaffectedNote(VEHICLE_METRIC_IGNORES, activeIssueFilters, t),
    [activeIssueFilters, t],
  );

  const [dash, setDash] = useState<AnalysisDashboard | null>(null);
  const [stations, setStations] = useState<Station[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [d, stationRes] = await Promise.all([
        api.analysisDashboard(applied),
        api.listStations().catch(() => ({ items: [] as Station[] })),
      ]);
      setDash(d);
      setStations(stationRes.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('analysis.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [applied, t]);

  useEffect(() => {
    void load();
  }, [load]);

  function applyFilters() {
    const next = new URLSearchParams();
    if (draftFrom) next.set('from', draftFrom);
    if (draftTo) next.set('to', draftTo);
    if (draftStation) next.set('station', draftStation);
    if (draftStatus) next.set('status', draftStatus);
    if (draftIssueType) next.set('issue_type', draftIssueType);
    if (draftVin.trim()) next.set('vin_suffix', draftVin.trim());
    if (draftSeverity) next.set('severity', draftSeverity);
    if (draftEolStage) next.set('eol_stage', draftEolStage);
    if (draftCompare) next.set('compare', draftCompare);
    setSearchParams(next);
  }

  function clearFilters() {
    setDraftFrom('');
    setDraftTo('');
    setDraftStation('');
    setDraftStatus('');
    setDraftIssueType('');
    setDraftVin('');
    setDraftSeverity('');
    setDraftEolStage('');
    setDraftCompare('');
    setSearchParams(new URLSearchParams());
  }

  const compareHint = compareLabel(dash?.CompareMode ?? applied.compare, t);

  const filterSummary = [
    applied.from && t('analysis.fromFilter', { from: applied.from }),
    applied.to && t('analysis.toFilter', { to: applied.to }),
    applied.station && t('analysis.stationFilter', { id: applied.station }),
    applied.status && t('analysis.statusFilter', { status: applied.status }),
    applied.issue_type && t('analysis.typeFilter', { type: applied.issue_type }),
    applied.vin_suffix && t('analysis.vinFilter', { suffix: applied.vin_suffix }),
    applied.severity && t('analysis.severityFilter', { severity: applied.severity }),
    applied.eol_stage &&
      t('analysis.eolStageFilter', {
        stage: eolStageLabel(applied.eol_stage, t),
      }),
    applied.compare && compareLabel(applied.compare, t),
  ]
    .filter(Boolean)
    .join(' · ') || t('analysis.noFilters');

  const severity = dash?.Severity ?? [];
  const topVehicles = useMemo(() => rankTopVehicles(severity, 5), [severity]);

  const statusPie = useMemo(
    () =>
      (dash?.IssueStatus ?? [])
        .filter((row) => row.Count > 0)
        .map((row) => ({
          name: issueStatusLabel(row.Status, t),
          value: row.Count,
          color: issueStatusColor(row.Status),
        })),
    [dash, t],
  );

  const severityPie = useMemo(
    () =>
      (dash?.SeverityMix ?? [])
        .filter((row) => row.Count > 0)
        .map((row) => ({
          name: t(`severity.${row.Severity.toLowerCase()}` as 'severity.critical'),
          value: row.Count,
          color:
            row.Severity === 'CRITICAL'
              ? statusColors.severityCritical
              : row.Severity === 'MEDIUM'
                ? statusColors.severityMedium
                : statusColors.severityLow,
        })),
    [dash, t],
  );

  const workPie = useMemo(() => {
    const completed = dash?.WorkSplit.Completed ?? 0;
    const ongoing = dash?.WorkSplit.Ongoing ?? 0;
    if (completed === 0 && ongoing === 0) return [];
    return [
      { name: t('analysis.completedSlice'), value: completed, color: statusColors.ok },
      { name: t('analysis.inProgress'), value: ongoing, color: statusColors.issueInProgress },
    ];
  }, [dash, t]);

  const conditionalPie = useMemo(() => {
    const approved = dash?.ConditionalMix.Approved ?? 0;
    const conditional = dash?.ConditionalMix.Conditional ?? 0;
    if (approved === 0 && conditional === 0) return [];
    return [
      {
        name: t('analysis.qualityApproved'),
        value: approved,
        color: statusColors.ok,
      },
      {
        name: t('analysis.conditionalApproved'),
        value: conditional,
        color: statusColors.issueInProgress,
      },
    ];
  }, [dash, t]);

  const openAgeBars = useMemo(
    () =>
      (dash?.OpenAgeBuckets ?? []).map((row) => ({
        bucket: t(ageBucketLabel(row.Bucket)),
        count: row.Count,
      })),
    [dash, t],
  );

  const openTrend = useMemo(
    () =>
      (dash?.DailyOpenTrend ?? []).map((row) => ({
        label: formatChartDay(row.Day, locale),
        open: row.PendingCount,
      })),
    [dash, locale],
  );

  const completedTrend = useMemo(
    () =>
      (dash?.CompletedDaily ?? []).map((row) => ({
        label: formatChartDay(row.Day, locale),
        closed: row.CompletedCount,
      })),
    [dash, locale],
  );

  const openStationBars = useMemo(
    () =>
      (dash?.OpenByStation ?? []).map((r) => ({
        station:
          r.StationName ||
          stations.find((s) => s.ID === r.StationID)?.Name ||
          t('analysis.stationN', { id: r.StationID }),
        issues: r.IssueCount,
      })),
    [dash, stations, t],
  );

  const totalStationBars = useMemo(
    () =>
      (dash?.TotalByStation ?? []).map((r) => ({
        station:
          r.StationName ||
          stations.find((s) => s.ID === r.StationID)?.Name ||
          t('analysis.stationN', { id: r.StationID }),
        issues: r.IssueCount,
      })),
    [dash, stations, t],
  );

  const mttrBars = useMemo(
    () =>
      (dash?.MTTR ?? []).map((r) => ({
        station:
          r.StationName ||
          stations.find((s) => s.ID === r.StationID)?.Name ||
          t('analysis.stationN', { id: r.StationID }),
        hours: r.Hours ?? Number((r.MeanTimeToResolve / 1e9 / 3600).toFixed(2)),
      })),
    [dash, stations, t],
  );

  const issueTypeBars = useMemo(
    () =>
      (dash?.TopIssueTypes ?? []).map((r) => ({
        type: r.Name,
        count: r.Count,
      })),
    [dash],
  );

  const eolFunnelRows = dash?.EOLFunnel ?? [];
  const stagePerf = dash?.StagePerformance ?? [];

  function exportCsv() {
    if (!dash) return;
    setExporting(true);
    try {
      const csv = buildAnalysisCsv(dash, applied, t);
      downloadBlob(
        new Blob([csv], { type: 'text/csv;charset=utf-8' }),
        `karea-analysis-${new Date().toISOString().slice(0, 10)}.csv`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t('analysis.exportCsvFailed'));
    } finally {
      setExporting(false);
    }
  }

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold sm:text-2xl">{t('analysis.title')}</h1>
          <p className="mt-1 text-[13px]" style={mutedCaption}>
            {t('analysis.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--status-ok)] hover:bg-[var(--bg-surface-2)]"
            aria-label={t('home.refresh')}
            title={t('home.refresh')}
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : undefined} />
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={exporting || !dash}
            className="inline-flex min-h-touch items-center gap-2 rounded-lg bg-[var(--accent)] px-4 text-[15px] font-medium text-white disabled:opacity-60"
          >
            <Download size={16} />
            {exporting ? t('analysis.exporting') : t('analysis.exportCsv')}
          </button>
        </div>
      </div>

      <div
        className="mt-6 grid grid-cols-1 gap-3 rounded-xl border bg-[var(--bg-surface-1)] p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        style={{ borderColor: 'var(--border)' }}
      >
        <FilterField label={t('analysis.fromLabel')}>
          <input
            type="date"
            value={draftFrom}
            onChange={(e) => setDraftFrom(e.target.value)}
            className="min-h-touch w-full rounded-lg border bg-[var(--bg-page)] px-3 text-[15px]"
            style={{ borderColor: 'var(--border)' }}
          />
        </FilterField>
        <FilterField label={t('analysis.toLabel')}>
          <input
            type="date"
            value={draftTo}
            onChange={(e) => setDraftTo(e.target.value)}
            className="min-h-touch w-full rounded-lg border bg-[var(--bg-page)] px-3 text-[15px]"
            style={{ borderColor: 'var(--border)' }}
          />
        </FilterField>
        <FilterField label={t('vehicles.station')}>
          <select
            value={draftStation}
            onChange={(e) => setDraftStation(e.target.value)}
            className="min-h-touch w-full rounded-lg border bg-[var(--bg-page)] px-3 text-[15px]"
            style={{ borderColor: 'var(--border)' }}
          >
            <option value="">{t('common.all')}</option>
            {stations
              .slice()
              .sort((a, b) => a.SequenceNo - b.SequenceNo)
              .map((s) => (
                <option key={s.ID} value={String(s.ID)}>
                  {s.Name}
                </option>
              ))}
          </select>
        </FilterField>
        <FilterField label={t('analysis.vehicleStatus')}>
          <select
            value={draftStatus}
            onChange={(e) => setDraftStatus(e.target.value)}
            className="min-h-touch w-full rounded-lg border bg-[var(--bg-page)] px-3 text-[15px]"
            style={{ borderColor: 'var(--border)' }}
          >
            {VEHICLE_STATUSES.map((s) => (
              <option key={s || 'all'} value={s}>
                {vehicleStatusLabel(s, t)}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label={t('analysis.severity')}>
          <select
            value={draftSeverity}
            onChange={(e) => setDraftSeverity(e.target.value)}
            className="min-h-touch w-full rounded-lg border bg-[var(--bg-page)] px-3 text-[15px]"
            style={{ borderColor: 'var(--border)' }}
          >
            <option value="">{t('common.all')}</option>
            {SEVERITIES.filter(Boolean).map((s) => (
              <option key={s} value={s}>
                {t(`severity.${s.toLowerCase()}` as 'severity.critical')}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label={t('analysis.eolStage')}>
          <select
            value={draftEolStage}
            onChange={(e) => setDraftEolStage(e.target.value)}
            className="min-h-touch w-full rounded-lg border bg-[var(--bg-page)] px-3 text-[15px]"
            style={{ borderColor: 'var(--border)' }}
          >
            {EOL_STAGES.map((s) => (
              <option key={s || 'all'} value={s}>
                {s ? eolStageLabel(s, t) : t('common.all')}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label={t('analysis.issueType')}>
          <input
            type="text"
            value={draftIssueType}
            onChange={(e) => setDraftIssueType(e.target.value)}
            placeholder={t('analysis.issueTypePlaceholder')}
            className="min-h-touch w-full rounded-lg border bg-[var(--bg-page)] px-3 text-[15px]"
            style={{ borderColor: 'var(--border)' }}
          />
        </FilterField>
        <FilterField label={t('analysis.vinSuffix')}>
          <VinSearchBox
            value={draftVin}
            onChange={setDraftVin}
            showResults={false}
            className="w-full"
          />
        </FilterField>
        <FilterField label={t('analysis.compare')}>
          <select
            value={draftCompare}
            onChange={(e) => setDraftCompare(e.target.value)}
            className="min-h-touch w-full rounded-lg border bg-[var(--bg-page)] px-3 text-[15px]"
            style={{ borderColor: 'var(--border)' }}
          >
            <option value="">{t('analysis.compare.none')}</option>
            {COMPARE_MODES.filter(Boolean).map((mode) => (
              <option key={mode} value={mode}>
                {compareLabel(mode, t)}
              </option>
            ))}
          </select>
        </FilterField>
        <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-3 xl:col-span-4">
          <button
            type="button"
            onClick={applyFilters}
            className="min-h-touch rounded-lg bg-[var(--accent)] px-4 text-[15px] text-white"
          >
            {t('analysis.apply')}
          </button>
          <button
            type="button"
            onClick={clearFilters}
            className="min-h-touch rounded-lg border px-4 text-[15px]"
            style={{ borderColor: 'var(--border)' }}
          >
            {t('analysis.clearFilters')}
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-4 text-[13px]" style={{ color: 'var(--status-not-ok)' }}>
          {error}
        </p>
      )}

      <p className="mt-4 text-[13px]" style={mutedCaption}>
        {t('analysis.activeFilters', { summary: filterSummary })}
      </p>

      {loading && !dash && !error && (
        <p className="mt-2 text-[13px]" style={mutedCaption}>
          {t('home.metricsLoading')}
        </p>
      )}

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {KPI_DEFS.map((def) => (
          <AnalysisKpiCard
            key={def.key}
            title={t(def.titleKey)}
            icon={def.icon}
            accent={def.accent}
            value={kpiNumber(dash?.Cards, def.key)}
            previous={kpiNumber(dash?.CompareCards, def.key)}
            compareHint={compareHint}
            spark={def.spark ? sparkSeries(dash, def.spark, locale) : undefined}
            format={def.format}
            invertDelta={def.invertDelta}
            filterNote={filterUnaffectedNote(
              def.ignoresIssueFilters,
              activeIssueFilters,
              t,
            )}
          />
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title={t('analysis.doneVsOpen')} icon={<Gauge size={18} />}>
          {workPie.length === 0 ? (
            <EmptyChart />
          ) : (
            <DonutChart data={workPie} />
          )}
        </ChartCard>
        <ChartCard title={t('analysis.statusDist')} icon={<Layers size={18} />}>
          {statusPie.length === 0 ? (
            <EmptyChart />
          ) : (
            <DonutChart data={statusPie} />
          )}
        </ChartCard>
        <ChartCard title={t('analysis.severityMix')} icon={<TriangleAlert size={18} />}>
          {severityPie.length === 0 ? (
            <EmptyChart />
          ) : (
            <DonutChart data={severityPie} />
          )}
        </ChartCard>
        <ChartCard title={t('analysis.conditionalMix')} icon={<BadgeCheck size={18} />}>
          {conditionalPie.length === 0 ? (
            <EmptyChart />
          ) : (
            <DonutChart data={conditionalPie} />
          )}
        </ChartCard>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title={t('analysis.dailyOpenTrend')}
          subtitle={t('analysis.dailyOpenTrendHint')}
          icon={<CalendarDays size={18} />}
        >
          {openTrend.length === 0 ? (
            <EmptyChart />
          ) : (
            <div className="chart-inert h-[220px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={openTrend} tabIndex={-1} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="label" tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis allowDecimals={false} width={32} tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} />
                  <Tooltip contentStyle={CHART_TOOLTIP} />
                  <Area type="monotone" dataKey="open" stroke={statusColors.issueOpen} fill={statusColors.issueOpen} fillOpacity={0.15} strokeWidth={2} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>
        <ChartCard
          title={t('analysis.completedDaily')}
          subtitle={t('analysis.completedDailyHint')}
          icon={<CalendarDays size={18} />}
        >
          {completedTrend.length === 0 ? (
            <EmptyChart />
          ) : (
            <div className="chart-inert h-[220px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={completedTrend} tabIndex={-1} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="label" tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis allowDecimals={false} width={32} tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} />
                  <Tooltip contentStyle={CHART_TOOLTIP} />
                  <Area type="monotone" dataKey="closed" stroke={statusColors.ok} fill={statusColors.ok} fillOpacity={0.15} strokeWidth={2} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title={t('analysis.openByStation')} icon={<BarChart3 size={18} />}>
          {openStationBars.length === 0 ? (
            <EmptyChart />
          ) : (
            <StationBarChart data={openStationBars} color={statusColors.issueOpen} name={t('nav.issues')} />
          )}
        </ChartCard>
        <ChartCard title={t('analysis.totalByStation')} icon={<BarChart3 size={18} />}>
          {totalStationBars.length === 0 ? (
            <EmptyChart />
          ) : (
            <StationBarChart data={totalStationBars} color={statusColors.notOk} name={t('nav.issues')} />
          )}
        </ChartCard>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title={t('analysis.openAge')} icon={<Timer size={18} />}>
          {openAgeBars.every((r) => r.count === 0) ? (
            <EmptyChart />
          ) : (
            <div className="chart-inert h-[220px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={openAgeBars} tabIndex={-1} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="bucket" tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} />
                  <YAxis allowDecimals={false} width={32} tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} />
                  <Tooltip contentStyle={CHART_TOOLTIP} />
                  <Bar dataKey="count" fill={statusColors.issueInProgress} name={t('nav.issues')} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>
        <ChartCard title={t('analysis.topIssueTypes')} icon={<ClipboardList size={18} />}>
          {issueTypeBars.length === 0 ? (
            <EmptyChart />
          ) : (
            <div className="chart-inert h-[220px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={issueTypeBars} tabIndex={-1} margin={{ top: 8, right: 8, left: 0, bottom: 48 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="type" tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} angle={-25} textAnchor="end" height={56} interval={0} />
                  <YAxis allowDecimals={false} width={32} tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} />
                  <Tooltip contentStyle={CHART_TOOLTIP} />
                  <Bar dataKey="count" fill={statusColors.info} name={t('nav.issues')} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title={t('analysis.eolFunnel')}
          icon={<Factory size={18} />}
          filterNote={vehicleFilterNote}
        >
          {eolFunnelRows.every((r) => r.Count === 0) ? (
            <EmptyChart />
          ) : (
            <div className="space-y-3">
              {eolFunnelRows.map((row) => {
                const total = eolFunnelRows.reduce((s, r) => s + r.Count, 0);
                const pct = total === 0 ? 0 : Math.round((row.Count / total) * 100);
                const color = STAGE_COLORS[row.Stage] ?? statusColors.info;
                return (
                  <div key={row.Stage}>
                    <div className="mb-1 flex items-center justify-between text-[13px]">
                      <span>{eolStageLabel(row.Stage, t)}</span>
                      <span className="tabular-nums" style={mutedCaption}>
                        {row.Count} ({pct}%)
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--bg-surface-2)' }}>
                      <div className="h-full rounded-full" style={{ width: `${Math.max(pct, row.Count > 0 ? 4 : 0)}%`, backgroundColor: color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ChartCard>
        <ChartCard
          title={t('analysis.stagePerformance')}
          icon={<Building2 size={18} />}
          filterNote={vehicleFilterNote}
        >
          {stagePerf.every((r) => r.Total === 0) ? (
            <EmptyChart />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[16rem] text-left text-[13px]">
                <thead>
                  <tr className="border-b text-[11px] font-semibold uppercase tracking-wide" style={{ borderColor: 'var(--border)', ...mutedCaption }}>
                    <th className="pb-2 pr-3">{t('home.colStage')}</th>
                    <th className="pb-2 pr-3 text-right">{t('analysis.doneShort')}</th>
                    <th className="pb-2 pr-3 text-right">{t('analysis.total')}</th>
                    <th className="pb-2">{t('home.colCompletion')}</th>
                  </tr>
                </thead>
                <tbody>
                  {stagePerf.map((row) => {
                    const pct = row.Total === 0 ? 0 : Math.round((row.Completed / row.Total) * 100);
                    const color = STAGE_COLORS[row.Stage] ?? statusColors.info;
                    return (
                      <tr key={row.Stage} className="border-b" style={{ borderColor: 'var(--border)' }}>
                        <td className="py-2.5 pr-3 font-medium">{eolStageLabel(row.Stage, t)}</td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">{row.Completed}</td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">{row.Total}</td>
                        <td className="py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="h-2 min-w-[5rem] flex-1 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--bg-surface-2)' }}>
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                            </div>
                            <span className="w-10 text-right tabular-nums text-[12px]" style={mutedCaption}>
                              {pct}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </ChartCard>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title={t('analysis.stationMttr')} icon={<Timer size={18} />}>
          {mttrBars.length === 0 ? (
            <EmptyChart />
          ) : (
            <div className="chart-inert h-[220px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={mttrBars} tabIndex={-1} margin={{ top: 8, right: 8, left: 0, bottom: 48 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="station" tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} angle={-35} textAnchor="end" height={60} interval={0} />
                  <YAxis width={36} tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} />
                  <Tooltip contentStyle={CHART_TOOLTIP} />
                  <Bar dataKey="hours" fill={statusColors.info} name={t('analysis.mttrH')} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>
        <ChartCard title={t('analysis.top5')} icon={<AlertCircle size={18} />}>
          {topVehicles.length === 0 ? (
            <EmptyChart />
          ) : (
            <ol className="space-y-3">
              {topVehicles.map((row) => {
                const raw = severityFillColor(row.worstSeverity);
                const color = row.worstSeverity === 'LOW' ? raw : raw;
                return (
                  <li key={row.vin} className="flex items-center gap-3">
                    <span className="w-5 shrink-0 text-right text-[13px] tabular-nums" style={mutedCaption}>
                      {row.rank}
                    </span>
                    <Link
                      to={`/vehicles/${encodeURIComponent(row.vin)}?tab=issues`}
                      className="w-16 shrink-0 font-mono text-[13px] font-medium text-[var(--accent)] hover:underline"
                      title={row.vin}
                    >
                      …{row.vinTail}
                    </Link>
                    <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--bg-surface-2)' }}>
                      <div className="h-full rounded-full" style={{ width: `${Math.max(row.barPct, 4)}%`, backgroundColor: color }} />
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
      </div>

      <ChartCard
        className="mt-4"
        title={t('analysis.vehicleBreakdown')}
        subtitle={t('analysis.vehicleBreakdownHint')}
        icon={<BarChart3 size={18} />}
      >
        {severity.length === 0 ? (
          <EmptyChart />
        ) : (
          <>
            <div className="chart-inert mt-2 h-48 w-full min-w-0 sm:h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={severity.map((r) => ({
                    vin: `…${r.VIN.slice(-5)}`,
                    critical: r.CriticalCount,
                    medium: r.MediumCount,
                    low: r.LowCount,
                  }))}
                  tabIndex={-1}
                  margin={{ top: 8, right: 8, left: 0, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="vin" tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis width={28} tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} />
                  <Tooltip contentStyle={CHART_TOOLTIP} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="critical" stackId="a" fill={statusColors.severityCritical} name={t('severity.critical')} isAnimationActive={false} />
                  <Bar dataKey="medium" stackId="a" fill={statusColors.severityMedium} name={t('severity.medium')} isAnimationActive={false} />
                  <Bar dataKey="low" stackId="a" fill={statusColors.severityLow} name={t('severity.low')} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <table className="mt-4 hidden w-full text-left text-[15px] sm:table">
              <thead>
                <tr className="text-[13px]" style={mutedCaption}>
                  <th className="pb-2 font-medium">{t('issue.vin')}</th>
                  <th className="pb-2 font-medium">{t('analysis.total')}</th>
                  <th className="pb-2 font-medium">{t('severity.critical')}</th>
                  <th className="pb-2 font-medium">{t('severity.medium')}</th>
                  <th className="pb-2 font-medium">{t('severity.low')}</th>
                </tr>
              </thead>
              <tbody>
                {severity.map((row) => (
                  <tr key={row.VIN} className="border-t" style={{ borderColor: 'var(--border)' }}>
                    <td className="py-2.5">
                      <Link to={`/vehicles/${row.VIN}`} className="font-medium text-[var(--accent)] hover:underline">
                        …{row.VIN.slice(-5)}
                      </Link>
                      <span className="ml-2 break-all text-[13px]" style={mutedCaption}>
                        {row.VIN}
                      </span>
                    </td>
                    <td className="py-2.5 tabular-nums">{row.TotalOpenIssues}</td>
                    <td className="py-2.5">
                      <SeverityIndicator severity="CRITICAL" count={row.CriticalCount} />
                    </td>
                    <td className="py-2.5">
                      <SeverityIndicator severity="MEDIUM" count={row.MediumCount} />
                    </td>
                    <td className="py-2.5">
                      <SeverityIndicator severity="LOW" count={row.LowCount} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </ChartCard>
    </section>
  );
}

function ageBucketLabel(bucket: string): (typeof AGE_BUCKET_KEYS)[keyof typeof AGE_BUCKET_KEYS] {
  if (bucket in AGE_BUCKET_KEYS) {
    return AGE_BUCKET_KEYS[bucket as keyof typeof AGE_BUCKET_KEYS];
  }
  return 'analysis.age.7plus';
}

function issueFilterLabel(
  kind: IssueFilterKind,
  t: ReturnType<typeof useI18n>['t'],
): string {
  switch (kind) {
    case 'severity':
      return t('analysis.filterNote.severity');
    case 'issue_type':
      return t('analysis.filterNote.issueType');
    case 'station':
      return t('analysis.filterNote.station');
  }
}

/** Returns a tooltip note only when at least one ignored filter is currently active. */
function filterUnaffectedNote(
  ignores: IssueFilterKind[] | undefined,
  active: IssueFilterKind[],
  t: ReturnType<typeof useI18n>['t'],
): string | null {
  if (!ignores?.length || active.length === 0) return null;
  const hit = ignores.filter((k) => active.includes(k));
  if (hit.length === 0) return null;
  return t('analysis.filterNote.unaffected', {
    filters: hit.map((k) => issueFilterLabel(k, t)).join(', '),
  });
}

function FilterScopeHint({ note }: { note: string }) {
  return (
    <span
      className="inline-flex shrink-0 text-[var(--text-secondary)]"
      title={note}
      aria-label={note}
    >
      <Info size={13} strokeWidth={2.25} />
    </span>
  );
}

function kpiNumber(
  cards: AnalysisKPICards | undefined,
  key: keyof AnalysisKPICards,
): number | null {
  if (!cards) return null;
  const v = cards[key];
  return typeof v === 'number' ? v : null;
}

function sparkSeries(
  dash: AnalysisDashboard | null,
  key: SparkKey,
  locale: string,
): DayCount[] {
  if (!dash) return [];
  const sparks = dash.Sparklines;
  if (key === 'Production') {
    return (sparks.Production ?? []).map((row) => ({
      day: row.Day,
      label: formatChartDay(row.Day, locale),
      count: row.PendingCount,
    }));
  }
  if (key === 'OpenStock') {
    return (sparks.OpenStock ?? []).map((row) => ({
      day: row.Day,
      label: formatChartDay(row.Day, locale),
      count: row.PendingCount,
    }));
  }
  const field = key === 'Opened' ? sparks.Opened : sparks.Closed;
  return (field ?? []).map((row) => ({
    day: row.Day,
    label: formatChartDay(row.Day, locale),
    count: row.CompletedCount,
  }));
}

function formatChartDay(iso: string, locale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(5, 10);
  return d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });
}

function compareLabel(mode: string | undefined, t: ReturnType<typeof useI18n>['t']): string {
  switch (mode) {
    case 'previous_week':
      return t('analysis.compare.previousWeek');
    case 'previous_month':
      return t('analysis.compare.previousMonth');
    case 'previous_period':
      return t('analysis.compare.previousPeriod');
    default:
      return t('analysis.compare.previousPeriod');
  }
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-[13px]" style={mutedCaption}>
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

function AnalysisKpiCard({
  title,
  icon,
  accent,
  value,
  previous,
  compareHint,
  spark,
  format,
  invertDelta,
  filterNote,
}: {
  title: string;
  icon: ReactNode;
  accent: string;
  value: number | null;
  previous: number | null;
  compareHint: string;
  spark?: DayCount[];
  format?: (v: number | null) => string;
  invertDelta?: boolean;
  filterNote?: string | null;
}) {
  const { t } = useI18n();
  const display =
    format?.(value) ??
    (value == null ? '—' : String(value));
  const cur = value ?? 0;
  const prev = previous ?? 0;
  let polarity = deltaPolarity(cur, prev);
  if (invertDelta) {
    polarity =
      polarity === 'up' ? 'down' : polarity === 'down' ? 'up' : 'neutral';
  }
  const color = deltaColor(polarity);
  const diff = cur - prev;
  const delta =
    format != null
      ? diff === 0
        ? '0'
        : `${diff > 0 ? '+' : ''}${diff.toFixed(2)}`
      : formatAbsDelta(cur, prev);
  const pct =
    format != null && prev === 0
      ? null
      : formatPercentDelta(cur, prev);

  return (
    <div
      className="rounded-xl border bg-[var(--bg-surface-1)] px-3.5 py-3"
      style={{ borderColor: 'var(--border)' }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-[12px] font-medium leading-snug" style={mutedCaption}>
          <span className="inline-flex items-center gap-1">
            <span>{title}</span>
            {filterNote ? <FilterScopeHint note={filterNote} /> : null}
          </span>
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
          {spark && spark.length > 1 && (
            <div className="h-8 w-16">
              <div className="chart-inert h-full w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={spark} tabIndex={-1} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
                    <Line type="monotone" dataKey="count" stroke={accent} strokeWidth={2} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      </div>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums leading-none text-[var(--text-primary)]">
        {display}
      </p>
      {previous != null && (
        <p className="mt-1.5 inline-flex flex-wrap items-center gap-1 text-[11px]" style={mutedCaption}>
          {t('analysis.compare.vs', { period: compareHint })}
          <DeltaBadge polarity={polarity} color={color} label={delta} />
          {pct != null && (
            <span className="tabular-nums" style={{ color }}>
              ({pct})
            </span>
          )}
        </p>
      )}
    </div>
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
    <span className="inline-flex items-center gap-0.5 text-[12px] font-semibold tabular-nums" style={{ color }}>
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
  icon,
  filterNote,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
  icon?: ReactNode;
  filterNote?: string | null;
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
              <span className="inline-flex shrink-0 text-[var(--accent)]" aria-hidden>
                {icon}
              </span>
            ) : null}
            <span className="min-w-0 inline-flex items-center gap-1.5">
              <span>{title}</span>
              {filterNote ? <FilterScopeHint note={filterNote} /> : null}
            </span>
          </h2>
          {subtitle && (
            <p className="mt-0.5 text-[12px] leading-snug" style={mutedCaption}>
              {subtitle}
            </p>
          )}
        </div>
      </div>
      <div className="mt-2.5">{children}</div>
    </div>
  );
}

function EmptyChart() {
  const { t } = useI18n();
  return (
    <p className="py-8 text-center text-[13px]" style={mutedCaption}>
      {t('analysis.noData')}
    </p>
  );
}

function DonutChart({
  data,
}: {
  data: { name: string; value: number; color: string }[];
}) {
  return (
    <div className="chart-inert h-[220px] w-full min-w-0 sm:h-[260px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart tabIndex={-1}>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius="52%"
            outerRadius="70%"
            startAngle={DONUT_START_ANGLE}
            endAngle={DONUT_START_ANGLE - 360}
            isAnimationActive={false}
            label={pieSliceLabel}
            labelLine={false}
            style={{ outline: 'none', cursor: 'default' }}
            rootTabIndex={-1}
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.color} style={{ outline: 'none', cursor: 'default' }} />
            ))}
          </Pie>
          <Tooltip contentStyle={CHART_TOOLTIP} />
          <Legend wrapperStyle={{ fontSize: 12 }} formatter={pieLegendFormatter} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

function StationBarChart({
  data,
  color,
  name,
}: {
  data: { station: string; issues: number }[];
  color: string;
  name: string;
}) {
  return (
    <div className="chart-inert h-[220px] w-full min-w-0 sm:h-[240px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} tabIndex={-1} margin={{ top: 8, right: 8, left: 0, bottom: 48 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="station" tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} angle={-35} textAnchor="end" height={60} interval={0} />
          <YAxis width={36} tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} />
          <Tooltip contentStyle={CHART_TOOLTIP} />
          <Bar dataKey="issues" fill={color} name={name} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function pieSliceLabel({ name, value }: { name?: string; value?: number }): string {
  if (!value) return '';
  return `${name} ${value}`;
}

function pieLegendFormatter(value: string, entry: { payload?: { value?: number } }) {
  const n = entry.payload?.value ?? 0;
  return `${value} (${n})`;
}
