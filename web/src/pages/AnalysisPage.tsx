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
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
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
  type IssueType,
  type Station,
} from '../lib/api';
import { buildAnalysisCsv } from '../lib/analysisExport';
import { AnalysisVinMultiSelect, type VinChip } from '../components/AnalysisVinMultiSelect';
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
const COMPARE_MODES = [
  '',
  'previous_day',
  'previous_period',
  'previous_week',
  'previous_month',
] as const;

const DONUT_START_ANGLE = 90;
const CHART_TOOLTIP = {
  backgroundColor: 'var(--bg-surface-2)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  color: 'var(--text-primary)',
  fontSize: 12,
} as const;
const mutedCaption = { color: 'var(--text-secondary)' } as const;
const CHART_H = 'h-[168px]';

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
  | 'analysis.kpi.closed'
  | 'analysis.kpi.completion';

type AnalysisUnitKey =
  | 'analysis.unit.vehicles'
  | 'analysis.unit.hours'
  | 'analysis.unit.percent'
  | 'analysis.unit.issues';

type KpiDef = {
  key: keyof AnalysisKPICards;
  titleKey: AnalysisKpiTitleKey;
  unitKey?: AnalysisUnitKey;
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

/**
 * Primary KPI strip (5 max) — ops + quality pulse only.
 * MTTR / FPY / sevk / teslim / kalite bekleyen live in charts below.
 */
const KPI_DEFS: KpiDef[] = [
  {
    key: 'TotalProduction',
    titleKey: 'analysis.kpi.production',
    unitKey: 'analysis.unit.vehicles',
    accent: statusColors.vehicleInProduction,
    icon: <Factory size={15} />,
    spark: 'Production',
    ignoresIssueFilters: VEHICLE_METRIC_IGNORES,
  },
  {
    key: 'OpenIssues',
    titleKey: 'analysis.kpi.open',
    unitKey: 'analysis.unit.issues',
    accent: statusColors.issueOpen,
    icon: <AlertCircle size={15} />,
    spark: 'OpenStock',
    invertDelta: true,
  },
  {
    key: 'CriticalOpen',
    titleKey: 'analysis.kpi.criticalOpen',
    unitKey: 'analysis.unit.issues',
    accent: statusColors.severityCritical,
    icon: <TriangleAlert size={15} />,
    invertDelta: true,
  },
  {
    key: 'ClosedIssues',
    titleKey: 'analysis.kpi.closed',
    unitKey: 'analysis.unit.issues',
    accent: statusColors.ok,
    icon: <Gauge size={15} />,
    spark: 'Closed',
  },
  {
    key: 'CompletionPercent',
    titleKey: 'analysis.kpi.completion',
    unitKey: 'analysis.unit.percent',
    accent: statusColors.info,
    icon: <BarChart3 size={15} />,
    format: (v) => (v == null ? '—' : String(v)),
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
  const [draftVins, setDraftVins] = useState<VinChip[]>(() =>
    parseVinsParam(searchParams.get('vins')),
  );
  const [draftSeverity, setDraftSeverity] = useState(searchParams.get('severity') ?? '');
  const [draftCompare, setDraftCompare] = useState(searchParams.get('compare') ?? '');
  const [issueTypes, setIssueTypes] = useState<IssueType[]>([]);

  const applied = useMemo(
    () => ({
      from: searchParams.get('from') ?? undefined,
      to: searchParams.get('to') ?? undefined,
      vins: searchParams.get('vins') ?? undefined,
      vin_suffix: searchParams.get('vin_suffix') ?? undefined,
      station: searchParams.get('station') ?? searchParams.get('phase') ?? undefined,
      status: searchParams.get('status') ?? undefined,
      issue_type: searchParams.get('issue_type') ?? undefined,
      severity: searchParams.get('severity') ?? undefined,
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
      const [d, stationRes, typesRes] = await Promise.all([
        api.analysisDashboard(applied),
        api.listStations().catch(() => ({ items: [] as Station[] })),
        api.listIssueTypes().catch(() => ({ items: [] as IssueType[] })),
      ]);
      setDash(d);
      setStations(stationRes.items ?? []);
      setIssueTypes(typesRes.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('analysis.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [applied, t]);

  useEffect(() => {
    void load();
  }, [load]);

  // Keep chip list in sync when URL vins change (e.g. back/forward).
  useEffect(() => {
    const fromUrl = parseVinsParam(searchParams.get('vins'));
    setDraftVins((prev) => {
      const prevKey = prev.map((v) => v.VIN).join(',');
      const nextKey = fromUrl.map((v) => v.VIN).join(',');
      return prevKey === nextKey ? prev : fromUrl;
    });
  }, [searchParams]);

  function applyFilters() {
    const next = new URLSearchParams();
    if (draftFrom) next.set('from', draftFrom);
    if (draftTo) next.set('to', draftTo);
    if (draftStation) next.set('station', draftStation);
    if (draftStatus) next.set('status', draftStatus);
    if (draftIssueType) next.set('issue_type', draftIssueType);
    if (draftVins.length > 0) {
      next.set('vins', draftVins.map((v) => v.VIN).join(','));
    }
    if (draftSeverity) next.set('severity', draftSeverity);
    if (draftCompare) next.set('compare', draftCompare);
    setSearchParams(next);
  }

  function clearFilters() {
    setDraftFrom('');
    setDraftTo('');
    setDraftStation('');
    setDraftStatus('');
    setDraftIssueType('');
    setDraftVins([]);
    setDraftSeverity('');
    setDraftCompare('');
    setSearchParams(new URLSearchParams());
  }

  const compareHint = compareVsLabel(dash?.CompareMode ?? applied.compare, t);

  const filterSummary = [
    applied.from && t('analysis.fromFilter', { from: applied.from }),
    applied.to && t('analysis.toFilter', { to: applied.to }),
    applied.station &&
      t('analysis.stationFilter', {
        id: stationNumber(Number(applied.station), stations),
      }),
    applied.status && t('analysis.statusFilter', { status: applied.status }),
    applied.issue_type && t('analysis.typeFilter', { type: applied.issue_type }),
    applied.vins &&
      t('analysis.vinMultiFilter', { n: applied.vins.split(',').filter(Boolean).length }),
    applied.vin_suffix && t('analysis.vinFilter', { suffix: applied.vin_suffix }),
    applied.severity && t('analysis.severityFilter', { severity: applied.severity }),
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

  const openStationBars = useMemo(
    () =>
      (dash?.OpenByStation ?? []).map((r) => ({
        station: numberedStation(r.StationID, stations, t),
        issues: r.IssueCount,
      })),
    [dash, stations, t],
  );

  const mttrBars = useMemo(
    () =>
      (dash?.MTTR ?? []).map((r) => ({
        station: numberedStation(r.StationID, stations, t),
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

  const dualTrend = useMemo(() => {
    const byDay = new Map<string, { label: string; open: number; closed: number }>();
    for (const row of dash?.DailyOpenTrend ?? []) {
      byDay.set(row.Day, {
        label: formatChartDay(row.Day, locale),
        open: row.PendingCount,
        closed: 0,
      });
    }
    for (const row of dash?.CompletedDaily ?? []) {
      const prev = byDay.get(row.Day);
      if (prev) {
        prev.closed = row.CompletedCount;
      } else {
        byDay.set(row.Day, {
          label: formatChartDay(row.Day, locale),
          open: 0,
          closed: row.CompletedCount,
        });
      }
    }
    return [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => v);
  }, [dash, locale]);

  const stageBars = useMemo(
    () =>
      (dash?.StagePerformance ?? []).map((row) => {
        const pct =
          row.Total === 0 ? 0 : Math.round((row.Completed / row.Total) * 1000) / 10;
        return {
          stage: eolStageLabel(row.Stage, t),
          completed: row.Completed,
          remaining: Math.max(row.Total - row.Completed, 0),
          total: row.Total,
          pct,
          fraction: `${row.Completed} / ${row.Total}`,
        };
      }),
    [dash, t],
  );

  const fpyStationBars = useMemo(
    () =>
      (dash?.FPYByStation ?? [])
        .filter((r) => r.TotalCount > 0)
        .map((r) => ({
          station: numberedStation(r.StationID, stations, t),
          pct: r.Percent ?? 0,
        })),
    [dash, stations, t],
  );

  const reporterBars = useMemo(
    () =>
      (dash?.OpenedByReporter ?? []).map((r) => ({
        name: r.ReporterName || '—',
        count: r.Count,
      })),
    [dash],
  );

  const typeSeverityStacked = useMemo(() => {
    const byType = new Map<
      string,
      { type: string; CRITICAL: number; MEDIUM: number; LOW: number }
    >();
    for (const row of dash?.TypeSeverity ?? []) {
      const cur = byType.get(row.TypeName) ?? {
        type: row.TypeName,
        CRITICAL: 0,
        MEDIUM: 0,
        LOW: 0,
      };
      if (row.Severity === 'CRITICAL') cur.CRITICAL = row.Count;
      else if (row.Severity === 'MEDIUM') cur.MEDIUM = row.Count;
      else if (row.Severity === 'LOW') cur.LOW = row.Count;
      byType.set(row.TypeName, cur);
    }
    return [...byType.values()];
  }, [dash]);

  const cumulativeFlow = useMemo(() => {
    const byDay = new Map<string, { label: string; opened: number; closed: number }>();
    for (const row of dash?.Sparklines?.Opened ?? []) {
      byDay.set(row.Day, {
        label: formatChartDay(row.Day, locale),
        opened: row.CompletedCount,
        closed: 0,
      });
    }
    for (const row of dash?.Sparklines?.Closed ?? []) {
      const prev = byDay.get(row.Day);
      if (prev) prev.closed = row.CompletedCount;
      else {
        byDay.set(row.Day, {
          label: formatChartDay(row.Day, locale),
          opened: 0,
          closed: row.CompletedCount,
        });
      }
    }
    let o = 0;
    let c = 0;
    return [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => {
        o += v.opened;
        c += v.closed;
        return { label: v.label, openedCum: o, closedCum: c, balance: o - c };
      });
  }, [dash, locale]);

  const eolWaitBars = useMemo(
    () =>
      (dash?.EOLStageWait ?? []).map((row) => ({
        stage:
          row.Stage === 'DELIVERY'
            ? t('analysis.wait.delivery')
            : eolStageLabel(row.Stage, t),
        hours: Number(row.AvgHours.toFixed(1)),
      })),
    [dash, t],
  );

  const eolFunnelRows = dash?.EOLFunnel ?? [];
  const fpyValue = dash?.Cards?.FirstTimeRightPercent ?? null;
  const mttrValue = dash?.Cards?.AvgResolutionHours ?? null;
  const branchShipHours = dash?.AvgHoursToBranchShip ?? null;

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
            className="inline-flex min-h-touch items-center gap-2 rounded-lg bg-[var(--accent)] px-3 text-[14px] font-medium text-white disabled:opacity-60"
          >
            <Download size={15} />
            {exporting ? t('analysis.exporting') : t('analysis.exportCsv')}
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-3 text-[13px]" style={{ color: 'var(--status-not-ok)' }}>
          {error}
        </p>
      )}

      {loading && !dash && !error && (
        <p className="mt-3 text-[13px]" style={mutedCaption}>
          {t('home.metricsLoading')}
        </p>
      )}

      {/* 1) KPI strip */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        {KPI_DEFS.map((def) => (
          <AnalysisKpiCard
            key={def.key}
            title={t(def.titleKey)}
            unit={def.unitKey ? t(def.unitKey) : undefined}
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

      {/* 2) Compact single-row filter bar */}
      <div
        data-testid="analysis-filters"
        className="mt-3 flex flex-wrap items-end gap-x-1.5 gap-y-2 overflow-x-auto rounded-xl border bg-[var(--bg-surface-1)] px-2.5 py-2 xl:flex-nowrap"
        style={{ borderColor: 'var(--border)' }}
      >
        <FilterField label={t('analysis.fromLabel')} className="w-[7.25rem] shrink-0">
          <input
            type="date"
            value={draftFrom}
            onChange={(e) => setDraftFrom(e.target.value)}
            className="min-h-9 w-full rounded-lg border bg-[var(--bg-page)] px-1.5 text-[12px]"
            style={{ borderColor: 'var(--border)' }}
          />
        </FilterField>
        <FilterField label={t('analysis.toLabel')} className="w-[7.25rem] shrink-0">
          <input
            type="date"
            value={draftTo}
            onChange={(e) => setDraftTo(e.target.value)}
            className="min-h-9 w-full rounded-lg border bg-[var(--bg-page)] px-1.5 text-[12px]"
            style={{ borderColor: 'var(--border)' }}
          />
        </FilterField>
        <FilterField label={t('vehicles.station')} className="w-[7rem] shrink-0">
          <select
            value={draftStation}
            onChange={(e) => setDraftStation(e.target.value)}
            className="min-h-9 w-full rounded-lg border bg-[var(--bg-page)] px-1.5 text-[12px]"
            style={{ borderColor: 'var(--border)' }}
          >
            <option value="">{t('common.all')}</option>
            {stations
              .slice()
              .sort((a, b) => a.SequenceNo - b.SequenceNo)
              .map((s) => (
                <option key={s.ID} value={String(s.ID)}>
                  {t('analysis.stationN', { id: s.SequenceNo })}
                </option>
              ))}
          </select>
        </FilterField>
        <FilterField label={t('analysis.vehicleStatus')} className="w-[7.25rem] shrink-0">
          <select
            value={draftStatus}
            onChange={(e) => setDraftStatus(e.target.value)}
            className="min-h-9 w-full rounded-lg border bg-[var(--bg-page)] px-1.5 text-[12px]"
            style={{ borderColor: 'var(--border)' }}
          >
            {VEHICLE_STATUSES.map((s) => (
              <option key={s || 'all'} value={s}>
                {vehicleStatusLabel(s, t)}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label={t('analysis.issueType')} className="w-[7.5rem] shrink-0">
          <select
            value={draftIssueType}
            onChange={(e) => setDraftIssueType(e.target.value)}
            className="min-h-9 w-full rounded-lg border bg-[var(--bg-page)] px-1.5 text-[12px]"
            style={{ borderColor: 'var(--border)' }}
          >
            <option value="">{t('common.all')}</option>
            {issueTypes.map((it) => (
              <option key={it.ID} value={it.Name}>
                {it.Name}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label={t('analysis.severity')} className="w-[6.25rem] shrink-0">
          <select
            value={draftSeverity}
            onChange={(e) => setDraftSeverity(e.target.value)}
            className="min-h-9 w-full rounded-lg border bg-[var(--bg-page)] px-1.5 text-[12px]"
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
        <FilterField
          label={t('analysis.vinSuffix')}
          hint={t('analysis.vinSuffixHint')}
          className="min-w-[9rem] max-w-[12rem] shrink grow basis-[9rem]"
        >
          <AnalysisVinMultiSelect
            selected={draftVins}
            onChange={setDraftVins}
            placeholder={t('analysis.vinSuffixPlaceholder')}
          />
        </FilterField>
        <FilterField label={t('analysis.compare')} className="w-[8rem] shrink-0">
          <select
            value={draftCompare}
            onChange={(e) => setDraftCompare(e.target.value)}
            className="min-h-9 w-full rounded-lg border bg-[var(--bg-page)] px-1.5 text-[12px]"
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
        <div className="flex shrink-0 items-end gap-1.5 pb-px xl:ml-auto">
          <button
            type="button"
            onClick={clearFilters}
            className="min-h-9 whitespace-nowrap rounded-lg px-2.5 text-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-2)] hover:text-[var(--text-primary)]"
          >
            {t('analysis.clearFilters')}
          </button>
          <button
            type="button"
            onClick={applyFilters}
            className="min-h-9 whitespace-nowrap rounded-lg bg-[var(--accent)] px-3.5 text-[12px] font-medium text-white"
          >
            {t('analysis.apply')}
          </button>
        </div>
      </div>

      <p className="mt-2 text-[12px]" style={mutedCaption}>
        {t('analysis.activeFilters', { summary: filterSummary })}
      </p>

      {/* 3) Charts — 3 columns, mixed types */}
      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <ChartCard
          title={t('analysis.stagePerformance')}
          icon={<Factory size={16} />}
          filterNote={vehicleFilterNote}
        >
          {stageBars.every((r) => r.total === 0) ? (
            <EmptyChart />
          ) : (
            <StageComboChart data={stageBars} completedLabel={t('analysis.doneShort')} pctLabel={t('home.colCompletion')} />
          )}
        </ChartCard>

        <ChartCard title={t('analysis.statusDist')} icon={<Layers size={16} />}>
          {statusPie.length === 0 ? <EmptyChart /> : <DonutChart data={statusPie} />}
        </ChartCard>

        <ChartCard title={t('analysis.severityMix')} icon={<TriangleAlert size={16} />}>
          {severityPie.length === 0 ? <EmptyChart /> : <DonutChart data={severityPie} />}
        </ChartCard>

        <ChartCard title={t('analysis.stationMttr')} icon={<Timer size={16} />}>
          {mttrBars.length === 0 ? (
            <EmptyChart />
          ) : (
            <div className={`chart-inert ${CHART_H} w-full min-w-0`}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={mttrBars} tabIndex={-1} margin={{ top: 4, right: 8, left: 0, bottom: 36 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="station" tick={{ fill: 'var(--text-secondary)', fontSize: 9 }} angle={-30} textAnchor="end" height={48} interval={0} />
                  <YAxis width={32} tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} />
                  <Tooltip contentStyle={CHART_TOOLTIP} />
                  <Bar dataKey="hours" fill={statusColors.info} name={t('analysis.mttrH')} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {(mttrValue != null || fpyValue != null) && (
            <p className="mt-2 flex flex-wrap gap-3 text-[11px]" style={mutedCaption}>
              {mttrValue != null && (
                <span>
                  {t('analysis.kpi.mttr')}: <strong className="text-[var(--text-primary)]">{mttrValue.toFixed(2)}</strong>
                </span>
              )}
              {fpyValue != null && (
                <span>
                  {t('analysis.kpi.fpy')}: <strong className="text-[var(--text-primary)]">{fpyValue}%</strong>
                </span>
              )}
            </p>
          )}
        </ChartCard>

        <ChartCard title={t('analysis.openByStation')} icon={<BarChart3 size={16} />}>
          {openStationBars.length === 0 ? (
            <EmptyChart />
          ) : (
            <HorizontalBarChart data={openStationBars} color={statusColors.issueOpen} />
          )}
        </ChartCard>

        <ChartCard title={t('analysis.top5')} icon={<AlertCircle size={16} />}>
          {topVehicles.length === 0 ? (
            <EmptyChart />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[14rem] text-left text-[12px]">
                <thead>
                  <tr className="border-b text-[10px] font-semibold uppercase tracking-wide" style={{ borderColor: 'var(--border)', ...mutedCaption }}>
                    <th className="pb-1.5 pr-2">{t('issue.vin')}</th>
                    <th className="pb-1.5 pr-2 text-right">{t('nav.issues')}</th>
                    <th className="pb-1.5">{t('severity.label')}</th>
                  </tr>
                </thead>
                <tbody>
                  {topVehicles.map((row) => {
                    const color = severityFillColor(row.worstSeverity);
                    return (
                      <tr key={row.vin} className="border-b" style={{ borderColor: 'var(--border)' }}>
                        <td className="py-1.5 pr-2">
                          <Link
                            to={`/vehicles/${encodeURIComponent(row.vin)}?tab=issues`}
                            className="font-mono text-[12px] font-medium text-[var(--accent)] hover:underline"
                          >
                            …{row.vinTail}
                          </Link>
                        </td>
                        <td className="py-1.5 pr-2 text-right tabular-nums font-semibold">{row.openCount}</td>
                        <td className="py-1.5">
                          <span
                            className="inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                            style={{
                              color,
                              backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)`,
                            }}
                          >
                            {t(`severity.${row.worstSeverity.toLowerCase()}` as 'severity.critical')}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </ChartCard>

        <ChartCard
          className="md:col-span-2"
          title={t('analysis.dailyOpenTrend')}
          subtitle={t('analysis.dailyTrendCombinedHint')}
          icon={<CalendarDays size={16} />}
        >
          {dualTrend.length === 0 ? (
            <EmptyChart />
          ) : (
            <div className={`chart-inert ${CHART_H} w-full min-w-0`}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dualTrend} tabIndex={-1} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="label" tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis allowDecimals={false} width={28} tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} />
                  <Tooltip contentStyle={CHART_TOOLTIP} />
                  <Area type="monotone" dataKey="open" name={t('analysis.stat.openActive')} stroke={statusColors.issueOpen} fill={statusColors.issueOpen} fillOpacity={0.12} strokeWidth={2} isAnimationActive={false} />
                  <Area type="monotone" dataKey="closed" name={t('analysis.stat.completed')} stroke={statusColors.ok} fill={statusColors.ok} fillOpacity={0.1} strokeWidth={2} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <ChartCard title={t('analysis.openAge')} icon={<Timer size={16} />}>
          {openAgeBars.every((r) => r.count === 0) ? (
            <EmptyChart />
          ) : (
            <div className={`chart-inert ${CHART_H} w-full min-w-0`}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={openAgeBars} tabIndex={-1} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="bucket" tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} />
                  <YAxis allowDecimals={false} width={28} tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} />
                  <Tooltip contentStyle={CHART_TOOLTIP} />
                  <Bar dataKey="count" fill={statusColors.issueInProgress} name={t('nav.issues')} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <ChartCard title={t('analysis.topIssueTypes')} icon={<ClipboardList size={16} />}>
          {issueTypeBars.length === 0 ? (
            <EmptyChart />
          ) : (
            <HorizontalTypeChart data={issueTypeBars} color={statusColors.info} />
          )}
        </ChartCard>

        <ChartCard title={t('analysis.doneVsOpen')} icon={<Gauge size={16} />}>
          {workPie.length === 0 ? <EmptyChart /> : <SplitBars data={workPie} />}
        </ChartCard>

        <ChartCard title={t('analysis.conditionalMix')} icon={<BadgeCheck size={16} />}>
          {conditionalPie.length === 0 ? <EmptyChart /> : <SplitBars data={conditionalPie} />}
        </ChartCard>

        <ChartCard
          title={t('analysis.eolFunnel')}
          icon={<Building2 size={16} />}
          filterNote={vehicleFilterNote}
        >
          {eolFunnelRows.every((r) => r.Count === 0) ? (
            <EmptyChart />
          ) : (
            <div className="space-y-2.5">
              {eolFunnelRows.map((row) => {
                const total = eolFunnelRows.reduce((s, r) => s + r.Count, 0);
                const pct = total === 0 ? 0 : Math.round((row.Count / total) * 100);
                const color = STAGE_COLORS[row.Stage] ?? statusColors.info;
                return (
                  <div key={row.Stage}>
                    <div className="mb-1 flex items-center justify-between text-[12px]">
                      <span>{eolStageLabel(row.Stage, t)}</span>
                      <span className="tabular-nums" style={mutedCaption}>
                        {row.Count} ({pct}%)
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--bg-surface-2)' }}>
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.max(pct, row.Count > 0 ? 4 : 0)}%`, backgroundColor: color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ChartCard>

        <ChartCard title={t('analysis.fpyByStation')} icon={<Layers size={16} />}>
          {fpyStationBars.length === 0 ? (
            <EmptyChart />
          ) : (
            <div className={`chart-inert ${CHART_H} w-full min-w-0`}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={fpyStationBars}
                  tabIndex={-1}
                  margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} unit="%" />
                  <YAxis type="category" dataKey="station" width={72} tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} />
                  <Tooltip contentStyle={CHART_TOOLTIP} />
                  <Bar dataKey="pct" fill={statusColors.ok} name={t('analysis.kpi.fpy')} isAnimationActive={false} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <ChartCard title={t('analysis.openedByReporter')} icon={<ClipboardList size={16} />}>
          {reporterBars.length === 0 ? (
            <EmptyChart />
          ) : (
            <HorizontalTypeChart
              data={reporterBars.map((r) => ({ type: r.name, count: r.count }))}
              color={statusColors.issueInProgress}
            />
          )}
        </ChartCard>

        <ChartCard title={t('analysis.cumulativeFlow')} subtitle={t('analysis.cumulativeFlowHint')} icon={<CalendarDays size={16} />}>
          {cumulativeFlow.length === 0 ? (
            <EmptyChart />
          ) : (
            <div className={`chart-inert ${CHART_H} w-full min-w-0`}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={cumulativeFlow} tabIndex={-1} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="label" tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis allowDecimals={false} width={28} tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} />
                  <Tooltip contentStyle={CHART_TOOLTIP} />
                  <Area type="monotone" dataKey="openedCum" name={t('analysis.kpi.opened')} stroke={statusColors.issueOpen} fill={statusColors.issueOpen} fillOpacity={0.12} strokeWidth={2} isAnimationActive={false} />
                  <Area type="monotone" dataKey="closedCum" name={t('analysis.kpi.closed')} stroke={statusColors.ok} fill={statusColors.ok} fillOpacity={0.1} strokeWidth={2} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <ChartCard title={t('analysis.typeSeverity')} icon={<TriangleAlert size={16} />}>
          {typeSeverityStacked.length === 0 ? (
            <EmptyChart />
          ) : (
            <div className={`chart-inert ${CHART_H} w-full min-w-0`}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={typeSeverityStacked} tabIndex={-1} margin={{ top: 4, right: 8, left: 0, bottom: 28 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="type" tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} interval={0} />
                  <YAxis allowDecimals={false} width={28} tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} />
                  <Tooltip contentStyle={CHART_TOOLTIP} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="CRITICAL" stackId="a" fill={statusColors.severityCritical} name={t('severity.critical')} isAnimationActive={false} />
                  <Bar dataKey="MEDIUM" stackId="a" fill={statusColors.severityMedium} name={t('severity.medium')} isAnimationActive={false} />
                  <Bar dataKey="LOW" stackId="a" fill={statusColors.severityLow} name={t('severity.low')} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <ChartCard
          title={t('analysis.branchShipHours')}
          icon={<Timer size={16} />}
          filterNote={vehicleFilterNote}
        >
          {branchShipHours == null && eolWaitBars.length === 0 ? (
            <EmptyChart />
          ) : (
            <div className="space-y-3 py-1">
              {branchShipHours != null && (
                <p className="text-[13px]">
                  <span style={mutedCaption}>{t('analysis.branchShipHoursHint')}: </span>
                  <strong className="tabular-nums text-[var(--text-primary)]">
                    {branchShipHours.toFixed(1)} {t('analysis.unit.hours')}
                  </strong>
                </p>
              )}
              {eolWaitBars.length > 0 && (
                <div className={`chart-inert ${CHART_H} w-full min-w-0`}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={eolWaitBars} tabIndex={-1} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="stage" tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} />
                      <YAxis width={32} tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} />
                      <Tooltip contentStyle={CHART_TOOLTIP} />
                      <Bar dataKey="hours" fill={statusColors.info} name={t('analysis.unit.hours')} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}
        </ChartCard>
      </div>

      <ChartCard
        className="mt-3"
        title={t('analysis.vehicleBreakdown')}
        subtitle={t('analysis.vehicleBreakdownHint')}
        icon={<BarChart3 size={16} />}
      >
        {severity.length === 0 ? (
          <EmptyChart />
        ) : (
          <>
            <div className={`chart-inert ${CHART_H} w-full min-w-0`}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={severity.map((r) => ({
                    vin: `…${r.VIN.slice(-5)}`,
                    critical: r.CriticalCount,
                    medium: r.MediumCount,
                    low: r.LowCount,
                  }))}
                  tabIndex={-1}
                  margin={{ top: 4, right: 8, left: 0, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="vin" tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis width={28} tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} />
                  <Tooltip contentStyle={CHART_TOOLTIP} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="critical" stackId="a" fill={statusColors.severityCritical} name={t('severity.critical')} isAnimationActive={false} />
                  <Bar dataKey="medium" stackId="a" fill={statusColors.severityMedium} name={t('severity.medium')} isAnimationActive={false} />
                  <Bar dataKey="low" stackId="a" fill={statusColors.severityLow} name={t('severity.low')} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <table className="mt-3 hidden w-full text-left text-[13px] sm:table">
              <thead>
                <tr className="text-[12px]" style={mutedCaption}>
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
                    <td className="py-2">
                      <Link to={`/vehicles/${row.VIN}`} className="font-medium text-[var(--accent)] hover:underline">
                        …{row.VIN.slice(-5)}
                      </Link>
                    </td>
                    <td className="py-2 tabular-nums">{row.TotalOpenIssues}</td>
                    <td className="py-2">
                      <SeverityIndicator severity="CRITICAL" count={row.CriticalCount} />
                    </td>
                    <td className="py-2">
                      <SeverityIndicator severity="MEDIUM" count={row.MediumCount} />
                    </td>
                    <td className="py-2">
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
    case 'previous_day':
      return t('analysis.compare.previousDay');
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

/** Full “vs …” phrase for KPI footers — tracks the active compare mode. */
function compareVsLabel(mode: string | undefined, t: ReturnType<typeof useI18n>['t']): string {
  switch (mode) {
    case 'previous_day':
      return t('analysis.compare.vsDay');
    case 'previous_week':
      return t('analysis.compare.vsWeek');
    case 'previous_month':
      return t('analysis.compare.vsMonth');
    case 'previous_period':
    case '':
    case undefined:
      return t('analysis.compare.vsPeriod');
    default:
      return t('analysis.compare.vsPeriod');
  }
}

function parseVinsParam(raw: string | null): VinChip[] {
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
    .map((VIN) => ({ VIN }));
}

function stationNumber(stationId: number, stations: Station[]): number {
  return stations.find((s) => s.ID === stationId)?.SequenceNo ?? stationId;
}

function numberedStation(
  stationId: number,
  stations: Station[],
  t: ReturnType<typeof useI18n>['t'],
): string {
  return t('analysis.stationN', { id: stationNumber(stationId, stations) });
}

function FilterField({
  label,
  hint,
  className = '',
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`block text-[11px] font-medium ${className}`} style={mutedCaption}>
      <span className="inline-flex items-center gap-1">
        {label}
        {hint ? (
          <span title={hint} aria-label={hint} className="inline-flex text-[var(--text-secondary)]">
            <Info size={11} strokeWidth={2.25} />
          </span>
        ) : null}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function AnalysisKpiCard({
  title,
  unit,
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
  unit?: string;
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
      className="rounded-xl border bg-[var(--bg-surface-1)] px-3 py-2.5"
      style={{ borderColor: 'var(--border)' }}
    >
      <div className="flex items-start gap-2">
        <div
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
          style={{
            color: accent,
            backgroundColor: `color-mix(in srgb, ${accent} 16%, transparent)`,
          }}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="inline-flex items-center gap-1 text-[11px] font-medium leading-snug" style={mutedCaption}>
            <span className="truncate">{title}</span>
            {filterNote ? <FilterScopeHint note={filterNote} /> : null}
          </p>
          <p className="mt-1 flex items-baseline gap-1.5 text-[var(--text-primary)]">
            <span className="text-xl font-semibold tabular-nums leading-none">{display}</span>
            {unit ? (
              <span className="text-[11px] font-medium" style={mutedCaption}>
                {unit}
              </span>
            ) : null}
          </p>
        </div>
        {spark && spark.length > 1 ? (
          <div className="h-9 w-[4.25rem] shrink-0 self-center">
            <div className="chart-inert h-full w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={spark} tabIndex={-1} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
                  <Line type="monotone" dataKey="count" stroke={accent} strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : null}
      </div>
      {previous != null && (
        <p className="mt-2 inline-flex flex-wrap items-center gap-1 pl-9 text-[10px]" style={mutedCaption}>
          <span>{compareHint}</span>
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
    <p className="py-6 text-center text-[12px]" style={mutedCaption}>
      {t('analysis.noData')}
    </p>
  );
}

function DonutChart({
  data,
}: {
  data: { name: string; value: number; color: string }[];
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="flex min-h-[140px] items-center gap-3">
      <div className="chart-inert relative h-[132px] w-[132px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart tabIndex={-1}>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius="58%"
              outerRadius="82%"
              startAngle={DONUT_START_ANGLE}
              endAngle={DONUT_START_ANGLE - 360}
              isAnimationActive={false}
              label={false}
              labelLine={false}
              style={{ outline: 'none', cursor: 'default' }}
              rootTabIndex={-1}
            >
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.color} style={{ outline: 'none', cursor: 'default' }} />
              ))}
            </Pie>
            <Tooltip contentStyle={CHART_TOOLTIP} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[10px]" style={mutedCaption}>
            Σ
          </span>
          <span className="text-[15px] font-semibold tabular-nums text-[var(--text-primary)]">
            {total}
          </span>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {data.map((row) => {
          const pct = total === 0 ? 0 : Math.round((row.value / total) * 1000) / 10;
          return (
            <li key={row.name} className="flex items-center gap-2 text-[12px]">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: row.color }}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate text-[var(--text-primary)]">{row.name}</span>
              <span className="shrink-0 tabular-nums font-semibold text-[var(--text-primary)]">
                {row.value}
              </span>
              <span className="w-10 shrink-0 text-right tabular-nums" style={mutedCaption}>
                {pct}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function HorizontalBarChart({
  data,
  color,
}: {
  data: { station: string; issues: number }[];
  color: string;
}) {
  return (
    <div className={`chart-inert ${CHART_H} w-full min-w-0`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          layout="vertical"
          data={data}
          tabIndex={-1}
          margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
          <XAxis type="number" allowDecimals={false} tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} />
          <YAxis
            type="category"
            dataKey="station"
            width={72}
            tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
          />
          <Tooltip contentStyle={CHART_TOOLTIP} />
          <Bar dataKey="issues" fill={color} isAnimationActive={false} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function HorizontalTypeChart({
  data,
  color,
}: {
  data: { type: string; count: number }[];
  color: string;
}) {
  return (
    <div className={`chart-inert ${CHART_H} w-full min-w-0`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          layout="vertical"
          data={data}
          tabIndex={-1}
          margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
          <XAxis type="number" allowDecimals={false} tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} />
          <YAxis
            type="category"
            dataKey="type"
            width={80}
            tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
          />
          <Tooltip contentStyle={CHART_TOOLTIP} />
          <Bar dataKey="count" fill={color} isAnimationActive={false} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function SplitBars({
  data,
}: {
  data: { name: string; value: number; color: string }[];
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="space-y-3 py-1">
      {data.map((row) => {
        const pct = total === 0 ? 0 : Math.round((row.value / total) * 100);
        return (
          <div key={row.name}>
            <div className="mb-1 flex items-center justify-between gap-2 text-[12px]">
              <span className="inline-flex items-center gap-1.5 min-w-0">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
                <span className="truncate">{row.name}</span>
              </span>
              <span className="shrink-0 tabular-nums" style={mutedCaption}>
                {row.value} ({pct}%)
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--bg-surface-2)' }}>
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.max(pct, row.value > 0 ? 4 : 0)}%`, backgroundColor: row.color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StageComboChart({
  data,
  completedLabel,
  pctLabel,
}: {
  data: {
    stage: string;
    completed: number;
    total: number;
    pct: number;
    fraction: string;
  }[];
  completedLabel: string;
  pctLabel: string;
}) {
  return (
    <div className="chart-inert h-[200px] w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} tabIndex={-1} margin={{ top: 18, right: 28, left: 0, bottom: 36 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="stage"
            interval={0}
            height={52}
            tick={(props: { x?: number; y?: number; index?: number; payload?: { value?: string } }) => {
              const row = data[props.index ?? 0];
              return (
                <g transform={`translate(${props.x ?? 0},${props.y ?? 0})`}>
                  <text dy={12} textAnchor="middle" fill="var(--text-primary)" fontSize={10} fontWeight={600}>
                    {props.payload?.value}
                  </text>
                  <text dy={24} textAnchor="middle" fill="var(--text-secondary)" fontSize={9}>
                    {row?.fraction ?? ''}
                  </text>
                  <text dy={36} textAnchor="middle" fill={statusColors.ok} fontSize={9} fontWeight={700}>
                    {row != null ? `${row.pct}%` : ''}
                  </text>
                </g>
              );
            }}
          />
          <YAxis
            yAxisId="left"
            allowDecimals={false}
            width={28}
            tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            domain={[0, 100]}
            width={32}
            tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
            tickFormatter={(v: number) => `${v}%`}
          />
          <Tooltip contentStyle={CHART_TOOLTIP} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar
            yAxisId="left"
            dataKey="completed"
            name={completedLabel}
            fill={statusColors.ok}
            isAnimationActive={false}
            radius={[4, 4, 0, 0]}
          >
            <LabelList dataKey="completed" position="top" style={{ fill: 'var(--text-primary)', fontSize: 10 }} />
          </Bar>
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="pct"
            name={pctLabel}
            stroke="var(--text-secondary)"
            strokeWidth={2}
            dot={{ r: 3, fill: 'var(--text-secondary)' }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
