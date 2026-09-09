import { Printer } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from 'recharts';
import {
  formatDateRangeFull,
  formatDateRangeShort,
  formatDateTime,
} from '../../../../shared/i18n';
import { useAuth } from '../../auth/AuthProvider';
import { useI18n } from '../../i18n';
import type { AnalysisDashboard, AnalysisKPICards, Station } from '../../lib/api';
import { printSection } from '../../lib/print';
import { issueStatusColor, issueStatusLabel } from '../../lib/issueStatus';
import { eolStageLabel, vehicleStatusLabel } from '../../lib/vehicleStatus';
import { statusColors } from '../../theme/tokens';
import { PrintButton, PrintHeader, PrintRoot } from './PrintRoot';

/**
 * Print-only chart geometry (px). Sized for a 2-column A4 content grid
 * (~88mm cell). Never use ResponsiveContainer here — screen layout must
 * not leak into print.
 */
const CHART_W = 320;
const CHART_H = 168;
const PIE_SIZE = 140;

type KpiKey = keyof AnalysisKPICards;

const KPI_KEYS: { key: KpiKey; titleKey: string }[] = [
  { key: 'TotalProduction', titleKey: 'analysis.kpi.production' },
  { key: 'OpenIssues', titleKey: 'analysis.kpi.open' },
  { key: 'CriticalOpen', titleKey: 'analysis.kpi.criticalOpen' },
  { key: 'ClosedIssues', titleKey: 'analysis.kpi.closed' },
  { key: 'CompletionPercent', titleKey: 'analysis.kpi.completion' },
];

function verticalChartHeight(rowCount: number): number {
  return Math.min(280, Math.max(CHART_H, 28 + rowCount * 22));
}

function ChartCard({
  title,
  children,
  legend,
}: {
  title: string;
  children: ReactNode;
  legend?: ReactNode;
}) {
  return (
    <article className="print-chart-card">
      <h2>{title}</h2>
      <div className="print-chart-canvas">{children}</div>
      {legend ? <div className="print-chart-legend">{legend}</div> : null}
    </article>
  );
}

function ColorLegend({
  items,
  showValues = true,
}: {
  items: { name: string; value?: number; color: string }[];
  showValues?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <ul>
      {items.map((r) => (
        <li key={r.name}>
          <span
            className="print-legend-swatch"
            style={{ backgroundColor: r.color }}
            aria-hidden
          />
          <span>
            {showValues && r.value != null ? `${r.name}: ${r.value}` : r.name}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function AnalysisPrint({
  dash,
  stations,
  filterSummary,
  disabled,
}: {
  dash: AnalysisDashboard | null;
  stations: Station[];
  filterSummary: string;
  disabled?: boolean;
}) {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const [armed, setArmed] = useState(false);
  const [printedAt, setPrintedAt] = useState(() =>
    formatDateTime(new Date().toISOString(), locale),
  );

  const primaryRange =
    formatDateRangeFull(dash?.PrimaryFrom, dash?.PrimaryTo, locale) ||
    t('common.emDash');
  const compareRange =
    formatDateRangeFull(dash?.CompareFrom, dash?.CompareTo, locale) ||
    t('common.emDash');
  const compareShort = formatDateRangeShort(
    dash?.CompareFrom,
    dash?.CompareTo,
    locale,
  );

  async function onPrint() {
    flushSync(() => {
      setArmed(true);
      setPrintedAt(formatDateTime(new Date().toISOString(), locale));
    });
    await printSection('analysis');
  }

  const stageBars = (dash?.StagePerformance ?? []).map((row) => {
    const pct =
      row.Total === 0 ? 0 : Math.round((row.Completed / row.Total) * 1000) / 10;
    return {
      stage: eolStageLabel(row.Stage, t),
      completed: row.Completed,
      total: row.Total,
      pct,
    };
  });

  const statusPie = (dash?.IssueStatus ?? [])
    .filter((r) => r.Count > 0)
    .map((r) => ({
      name: issueStatusLabel(r.Status, t),
      value: r.Count,
      color: issueStatusColor(r.Status),
    }));

  const severityPie = (dash?.SeverityMix ?? [])
    .filter((r) => r.Count > 0)
    .map((r) => ({
      name: t(`severity.${r.Severity.toLowerCase()}` as 'severity.critical'),
      value: r.Count,
      color:
        r.Severity === 'CRITICAL'
          ? statusColors.severityCritical
          : r.Severity === 'MEDIUM'
            ? statusColors.severityMedium
            : statusColors.severityLow,
    }));

  const mttrBars = (dash?.MTTR ?? []).map((r) => ({
    station: t('analysis.stationN', {
      id: stations.find((s) => s.ID === r.StationID)?.SequenceNo ?? r.StationID,
    }),
    hours: Number((r.Hours ?? 0).toFixed(2)),
  }));

  const openStationBars = (dash?.OpenByStation ?? []).map((r) => ({
    station: t('analysis.stationN', {
      id: stations.find((s) => s.ID === r.StationID)?.SequenceNo ?? r.StationID,
    }),
    count: r.IssueCount,
  }));

  const reporterBars = (dash?.OpenedByReporter ?? []).map((r) => ({
    name: r.ReporterName.length > 18 ? `${r.ReporterName.slice(0, 16)}…` : r.ReporterName,
    count: r.Count,
  }));

  const typeSev = (() => {
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
    return [...byType.values()].map((r) => ({
      ...r,
      type: r.type.length > 14 ? `${r.type.slice(0, 12)}…` : r.type,
    }));
  })();

  const typeLegend = [
    { name: t('severity.critical'), value: 0, color: statusColors.severityCritical },
    { name: t('severity.medium'), value: 0, color: statusColors.severityMedium },
    { name: t('severity.low'), value: 0, color: statusColors.severityLow },
  ];

  const stageLegend = [
    { name: t('analysis.doneShort'), value: 0, color: statusColors.ok },
    { name: t('home.colCompletion'), value: 0, color: '#444444' },
  ];

  const shipped = dash?.BranchShippedList ?? [];
  const openH = verticalChartHeight(openStationBars.length);
  const reporterH = verticalChartHeight(reporterBars.length);

  return (
    <>
      <PrintButton
        label={t('common.print')}
        icon={<Printer size={15} aria-hidden />}
        disabled={disabled || !dash}
        onClick={() => void onPrint()}
      />
      <PrintRoot id="analysis">
        {armed && dash ? (
          <div className="print-analysis-doc">
            <PrintHeader
              title={t('print.analysis')}
              meta={[
                { label: t('print.dateRange'), value: primaryRange },
                {
                  label: t('print.comparePeriod'),
                  value: compareShort
                    ? `${compareShort} (${compareRange})`
                    : compareRange,
                },
                {
                  label: t('print.filters'),
                  value: filterSummary || t('print.filterNone'),
                },
                { label: t('print.printedAt'), value: printedAt },
                {
                  label: t('print.printedBy'),
                  value: user?.FullName?.trim() || t('common.emDash'),
                },
              ]}
            />

            <section className="print-section print-kpi-block">
              <h2>{t('analysis.kpiStrip')}</h2>
              <div className="print-kpi-grid">
                {KPI_KEYS.map((def) => {
                  const v = dash.Cards?.[def.key];
                  const display =
                    def.key === 'CompletionPercent'
                      ? v == null
                        ? '—'
                        : `${v}%`
                      : v == null
                        ? '—'
                        : String(v);
                  return (
                    <div key={def.key} className="print-kpi-card">
                      <div className="print-kpi-label">
                        {t(def.titleKey as 'analysis.kpi.production')}
                      </div>
                      <div className="print-kpi-value">{display}</div>
                    </div>
                  );
                })}
              </div>
            </section>

            <div className="print-chart-grid">
              <ChartCard
                title={t('analysis.stagePerformance')}
                legend={<ColorLegend items={stageLegend} showValues={false} />}
              >
                <ComposedChart
                  width={CHART_W}
                  height={CHART_H}
                  data={stageBars}
                  margin={{ top: 18, right: 28, left: 0, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#ccc" />
                  <XAxis
                    dataKey="stage"
                    interval={0}
                    tick={{ fontSize: 9, fill: '#111' }}
                  />
                  <YAxis
                    yAxisId="left"
                    allowDecimals={false}
                    width={28}
                    tick={{ fontSize: 9, fill: '#111' }}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    domain={[0, 100]}
                    width={32}
                    tick={{ fontSize: 9, fill: '#111' }}
                    tickFormatter={(v: number) => `${v}%`}
                  />
                  <Bar
                    yAxisId="left"
                    dataKey="completed"
                    name={t('analysis.doneShort')}
                    fill={statusColors.ok}
                    isAnimationActive={false}
                  >
                    <LabelList
                      dataKey="completed"
                      position="top"
                      style={{ fill: '#111', fontSize: 9 }}
                    />
                  </Bar>
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="pct"
                    name={t('home.colCompletion')}
                    stroke="#444"
                    strokeWidth={2}
                    dot={{ r: 2 }}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ChartCard>

              <ChartCard
                title={t('analysis.statusDist')}
                legend={<ColorLegend items={statusPie} />}
              >
                {statusPie.length === 0 ? (
                  <p className="print-chart-empty">{t('analysis.noData')}</p>
                ) : (
                <PieChart width={CHART_W} height={PIE_SIZE}>
                  <Pie
                    data={statusPie}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={36}
                    outerRadius={56}
                    isAnimationActive={false}
                    label={false}
                  >
                    {statusPie.map((e) => (
                      <Cell key={e.name} fill={e.color} />
                    ))}
                  </Pie>
                </PieChart>
                )}
              </ChartCard>

              <ChartCard
                title={t('analysis.severityMix')}
                legend={<ColorLegend items={severityPie} />}
              >
                {severityPie.length === 0 ? (
                  <p className="print-chart-empty">{t('analysis.noData')}</p>
                ) : (
                <PieChart width={CHART_W} height={PIE_SIZE}>
                  <Pie
                    data={severityPie}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={36}
                    outerRadius={56}
                    isAnimationActive={false}
                    label={false}
                  >
                    {severityPie.map((e) => (
                      <Cell key={e.name} fill={e.color} />
                    ))}
                  </Pie>
                </PieChart>
                )}
              </ChartCard>

              <ChartCard title={t('analysis.stationMttr')}>
                <BarChart
                  width={CHART_W}
                  height={CHART_H}
                  data={mttrBars}
                  margin={{ top: 8, right: 8, left: 0, bottom: 36 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#ccc" />
                  <XAxis
                    dataKey="station"
                    tick={{ fontSize: 8, fill: '#111' }}
                    interval={0}
                    angle={-30}
                    textAnchor="end"
                    height={44}
                  />
                  <YAxis width={28} tick={{ fontSize: 9, fill: '#111' }} />
                  <Bar
                    dataKey="hours"
                    fill={statusColors.info}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ChartCard>

              <ChartCard title={t('analysis.openByStation')}>
                <BarChart
                  layout="vertical"
                  width={CHART_W}
                  height={openH}
                  data={openStationBars}
                  margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#ccc"
                    horizontal={false}
                  />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tick={{ fontSize: 9, fill: '#111' }}
                  />
                  <YAxis
                    type="category"
                    dataKey="station"
                    width={72}
                    tick={{ fontSize: 9, fill: '#111' }}
                  />
                  <Bar
                    dataKey="count"
                    fill={statusColors.issueOpen}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ChartCard>

              <ChartCard title={t('analysis.openedByReporter')}>
                <BarChart
                  layout="vertical"
                  width={CHART_W}
                  height={reporterH}
                  data={reporterBars}
                  margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#ccc"
                    horizontal={false}
                  />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tick={{ fontSize: 9, fill: '#111' }}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={88}
                    tick={{ fontSize: 8, fill: '#111' }}
                  />
                  <Bar
                    dataKey="count"
                    fill={statusColors.issueInProgress}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ChartCard>

              <ChartCard
                title={t('analysis.typeSeverity')}
                legend={<ColorLegend items={typeLegend} showValues={false} />}
              >
                <BarChart
                  width={CHART_W}
                  height={CHART_H}
                  data={typeSev}
                  margin={{ top: 8, right: 8, left: 0, bottom: 28 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#ccc" />
                  <XAxis
                    dataKey="type"
                    tick={{ fontSize: 8, fill: '#111' }}
                    interval={0}
                    angle={-25}
                    textAnchor="end"
                    height={40}
                  />
                  <YAxis
                    allowDecimals={false}
                    width={28}
                    tick={{ fontSize: 9, fill: '#111' }}
                  />
                  <Bar
                    dataKey="CRITICAL"
                    stackId="a"
                    fill={statusColors.severityCritical}
                    isAnimationActive={false}
                  />
                  <Bar
                    dataKey="MEDIUM"
                    stackId="a"
                    fill={statusColors.severityMedium}
                    isAnimationActive={false}
                  />
                  <Bar
                    dataKey="LOW"
                    stackId="a"
                    fill={statusColors.severityLow}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ChartCard>
            </div>

            <section className="print-section print-table-block">
              <h2>{t('analysis.branchShippedList')}</h2>
              <table className="print-table">
                <thead>
                  <tr>
                    <th>{t('issue.vin')}</th>
                    <th>{t('analysis.shippedAt')}</th>
                    <th>{t('analysis.shippedBy')}</th>
                    <th>{t('issue.status')}</th>
                    <th>{t('print.eolStage')}</th>
                  </tr>
                </thead>
                <tbody>
                  {shipped.length === 0 ? (
                    <tr>
                      <td colSpan={5}>{t('analysis.noData')}</td>
                    </tr>
                  ) : (
                    shipped.map((r) => (
                      <tr key={`${r.VIN}-${r.ShippedAt}`}>
                        <td>
                          <span className="print-vin-tail">…{r.VIN.slice(-5)}</span>{' '}
                          <span className="print-vin-full">{r.VIN}</span>
                        </td>
                        <td>{formatDateTime(r.ShippedAt, locale)}</td>
                        <td>{r.ShippedByName || t('common.emDash')}</td>
                        <td>{vehicleStatusLabel(r.CurrentStatus, t)}</td>
                        <td>{eolStageLabel(r.EOLStage, t)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </section>

            <section className="print-section print-table-block">
              <h2>{t('analysis.top5')}</h2>
              <table className="print-table">
                <thead>
                  <tr>
                    <th>{t('issue.vin')}</th>
                    <th>{t('nav.issues')}</th>
                    <th>{t('severity.critical')}</th>
                    <th>{t('severity.medium')}</th>
                    <th>{t('severity.low')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(dash.Severity ?? []).slice(0, 5).map((r) => (
                    <tr key={r.VIN}>
                      <td>…{r.VIN.slice(-5)}</td>
                      <td>{r.TotalOpenIssues}</td>
                      <td>{r.CriticalCount}</td>
                      <td>{r.MediumCount}</td>
                      <td>{r.LowCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>
        ) : null}
      </PrintRoot>
    </>
  );
}
