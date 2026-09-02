import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
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
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import {
  api,
  type AnalysisDashboard,
  type Station,
  type StationDefectRate,
  type StationMTTR,
  type VehicleSeverityBreakdown,
} from '../lib/api';
import { VinSearchBox } from '../components/VinSearchBox';
import { SeverityIndicator, severityFillColor } from '../components/SeverityIndicator';
import { issueStatusColor, issueStatusLabel } from '../lib/issueStatus';
import { muteColor, rankTopVehicles } from '../lib/homeDashboard';
import { statusColors } from '../theme/tokens';
import { useI18n } from '../i18n';
import { VEHICLE_STATUS_FILTER_VALUES, vehicleStatusLabel } from '../lib/vehicleStatus';

const VEHICLE_STATUSES = ['', ...VEHICLE_STATUS_FILTER_VALUES] as const;

/**
 * Analysis tab — §4.4: filter bar, pie + bar charts, VIN severity breakdown,
 * Export/Print to A4 PDF via jspdf + html2canvas.
 */
export default function AnalysisPage() {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const exportRef = useRef<HTMLDivElement>(null);

  // Draft filters (applied on "Uygula")
  const [draftFrom, setDraftFrom] = useState(searchParams.get('from') ?? '');
  const [draftTo, setDraftTo] = useState(searchParams.get('to') ?? '');
  const [draftStation, setDraftStation] = useState(searchParams.get('station') ?? searchParams.get('phase') ?? '');
  const [draftStatus, setDraftStatus] = useState(searchParams.get('status') ?? '');
  const [draftIssueType, setDraftIssueType] = useState(
    searchParams.get('issue_type') ?? '',
  );
  const [draftVin, setDraftVin] = useState(searchParams.get('vin_suffix') ?? '');

  const applied = useMemo(
    () => ({
      from: searchParams.get('from') ?? undefined,
      to: searchParams.get('to') ?? undefined,
      vin_suffix: searchParams.get('vin_suffix') ?? undefined,
      station: searchParams.get('station') ?? searchParams.get('phase') ?? undefined,
      status: searchParams.get('status') ?? undefined,
      issue_type: searchParams.get('issue_type') ?? undefined,
    }),
    [searchParams],
  );

  const [dash, setDash] = useState<AnalysisDashboard | null>(null);
  const [severity, setSeverity] = useState<VehicleSeverityBreakdown[]>([]);
  const [mttr, setMttr] = useState<StationMTTR[]>([]);
  const [defects, setDefects] = useState<StationDefectRate[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [d, stationRes] = await Promise.all([
        api.analysisDashboard(applied),
        api.listStations().catch(() => ({ items: [] as Station[] })),
      ]);
      setDash(d);
      setSeverity(d.Severity ?? []);
      setMttr(d.MTTR ?? []);
      setDefects(d.DefectRate ?? []);
      setStations(stationRes.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('analysis.loadFailed'));
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
    setSearchParams(next);
  }

  const pieData = useMemo(() => {
    const completed = dash?.WorkSplit.Completed ?? 0;
    const ongoing = dash?.WorkSplit.Ongoing ?? 0;
    return [
      { name: t('analysis.completedSlice'), value: completed, color: statusColors.ok },
      { name: t('analysis.inProgress'), value: ongoing, color: statusColors.issueInProgress },
    ];
  }, [dash, t]);

  const statusPie = useMemo(
    () =>
      (dash?.IssueStatus ?? []).map((row) => ({
        name: issueStatusLabel(row.Status, t),
        value: row.Count,
        color: issueStatusColor(row.Status),
      })),
    [dash, t],
  );

  const mttrBars = useMemo(
    () =>
      mttr.map((r) => ({
        station: r.StationName || stations.find((s) => s.ID === r.StationID)?.Name || t('analysis.stationN', { id: r.StationID }),
        hours: r.Hours ?? Number((r.MeanTimeToResolve / 1e9 / 3600).toFixed(2)),
      })),
    [mttr, stations, t],
  );

  const defectBars = useMemo(
    () =>
      [...defects]
        .sort((a, b) => b.IssueCount - a.IssueCount)
        .map((r) => ({
          station: r.StationName || t('analysis.stationN', { id: r.StationID }),
          issues: r.IssueCount,
        })),
    [defects, t],
  );

  const stackedSeverity = useMemo(
    () =>
      severity.map((r) => ({
        vin: `…${r.VIN.slice(-5)}`,
        fullVin: r.VIN,
        critical: r.CriticalCount,
        medium: r.MediumCount,
        low: r.LowCount,
        total: r.TotalOpenIssues,
      })),
    [severity],
  );

  const topVehicles = useMemo(() => rankTopVehicles(severity, 5), [severity]);

  function vehicleStatLink(stat: string, includeDates: boolean) {
    const q = new URLSearchParams();
    q.set('analysisStat', stat);
    if (includeDates) {
      if (applied.from) q.set('from', applied.from);
      if (applied.to) q.set('to', applied.to);
    }
    return `/vehicles?${q.toString()}`;
  }

  function issueStatLink(stat: string) {
    const q = new URLSearchParams();
    q.set('analysisStat', stat);
    if (applied.from) q.set('from', applied.from);
    if (applied.to) q.set('to', applied.to);
    return `/issues?${q.toString()}`;
  }

  async function exportPdf() {
    if (!exportRef.current) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(exportRef.current, {
        scale: 2,
        backgroundColor: getComputedStyle(document.documentElement)
          .getPropertyValue('--bg-page')
          .trim() || '#0B0F14',
      });
      const img = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const usableWidth = pageWidth - margin * 2;
      const imgHeight = (canvas.height * usableWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = margin;
      pdf.addImage(img, 'PNG', margin, position, usableWidth, imgHeight);
      heightLeft -= pageHeight - margin * 2;

      while (heightLeft > 0) {
        position = margin - (imgHeight - heightLeft);
        pdf.addPage();
        pdf.addImage(img, 'PNG', margin, position, usableWidth, imgHeight);
        heightLeft -= pageHeight - margin * 2;
      }

      pdf.save(`karea-analysis-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('analysis.pdfFailed'));
    } finally {
      setExporting(false);
    }
  }

  const filterSummary = [
    applied.from && t('analysis.fromFilter', { from: applied.from }),
    applied.to && t('analysis.toFilter', { to: applied.to }),
    applied.station && t('analysis.stationFilter', { id: applied.station }),
    applied.status && t('analysis.statusFilter', { status: applied.status }),
    applied.issue_type && t('analysis.typeFilter', { type: applied.issue_type }),
    applied.vin_suffix && t('analysis.vinFilter', { suffix: applied.vin_suffix }),
  ]
    .filter(Boolean)
    .join(' · ') || t('analysis.noFilters');

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold sm:text-2xl">{t('analysis.title')}</h1>
          <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
            {t('analysis.subtitle')}
          </p>
        </div>
        <button
          type="button"
          onClick={exportPdf}
          disabled={exporting}
          className="min-h-touch w-full rounded-lg bg-[var(--accent)] px-4 text-[15px] font-medium text-white disabled:opacity-60 sm:w-auto"
        >
          {exporting ? t('analysis.exporting') : t('analysis.exportPrint')}
        </button>
      </div>

      {/* Filter bar — §4.4 */}
      <div
        className="mt-6 grid grid-cols-1 gap-3 rounded-xl border bg-[var(--bg-surface-1)] p-4 sm:flex sm:flex-wrap sm:items-end"
        style={{ borderColor: 'var(--border)' }}
      >
        <Field label={t('analysis.fromLabel')}>
          <input
            type="date"
            value={draftFrom}
            onChange={(e) => setDraftFrom(e.target.value)}
            className="min-h-touch w-full rounded-lg border bg-[var(--bg-page)] px-3 text-[15px] sm:w-auto"
            style={{ borderColor: 'var(--border)' }}
          />
        </Field>
        <Field label={t('analysis.toLabel')}>
          <input
            type="date"
            value={draftTo}
            onChange={(e) => setDraftTo(e.target.value)}
            className="min-h-touch w-full rounded-lg border bg-[var(--bg-page)] px-3 text-[15px] sm:w-auto"
            style={{ borderColor: 'var(--border)' }}
          />
        </Field>
        <Field label={t('vehicles.station')}>
          <select
            value={draftStation}
            onChange={(e) => setDraftStation(e.target.value)}
            className="min-h-touch w-full rounded-lg border bg-[var(--bg-page)] px-3 text-[15px] sm:w-auto"
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
        </Field>
        <Field label={t('analysis.vehicleStatus')}>
          <select
            value={draftStatus}
            onChange={(e) => setDraftStatus(e.target.value)}
            className="min-h-touch w-full rounded-lg border bg-[var(--bg-page)] px-3 text-[15px] sm:w-auto"
            style={{ borderColor: 'var(--border)' }}
          >
            {VEHICLE_STATUSES.map((s) => (
              <option key={s || 'all'} value={s}>
                {vehicleStatusLabel(s, t)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('analysis.issueType')}>
          <input
            type="text"
            value={draftIssueType}
            onChange={(e) => setDraftIssueType(e.target.value)}
            placeholder={t('analysis.issueTypePlaceholder')}
            className="min-h-touch w-full rounded-lg border bg-[var(--bg-page)] px-3 text-[15px] sm:w-40"
            style={{ borderColor: 'var(--border)' }}
          />
        </Field>
        <Field label={t('analysis.vinSuffix')}>
          <VinSearchBox
            value={draftVin}
            onChange={setDraftVin}
            showResults={false}
            className="w-full sm:w-48"
          />
        </Field>
        <button
          type="button"
          onClick={applyFilters}
          className="min-h-touch w-full rounded-lg bg-[var(--accent)] px-4 text-[15px] text-white sm:w-auto"
        >
          {t('analysis.apply')}
        </button>
      </div>

      {error && (
        <p className="mt-4 text-[13px]" style={{ color: 'var(--status-not-ok)' }}>
          {error}
        </p>
      )}

      <div ref={exportRef} className="mt-6 space-y-6 bg-[var(--bg-page)] p-1">
        <p className="text-[13px] text-[var(--text-secondary)]">
          {t('analysis.activeFilters', { summary: filterSummary })}
        </p>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard
            title={t('analysis.kpi.shippedToday')}
            value={dash?.KPIs.ShippedToday ?? 0}
            accent={statusColors.vehicleShipped}
            to={vehicleStatLink('shipped_today', true)}
          />
          <KpiCard
            title={t('analysis.kpi.shippedWeek')}
            value={dash?.KPIs.ShippedWeek ?? 0}
            accent={statusColors.ok}
            to={vehicleStatLink('shipped_week', true)}
          />
          <KpiCard
            title={t('analysis.kpi.depot')}
            value={dash?.KPIs.DepotReleasedInRange ?? 0}
            accent={statusColors.info}
            to={vehicleStatLink('depot_released', true)}
          />
          <KpiCard
            title={t('analysis.kpi.inProd')}
            value={dash?.KPIs.OnLineCount ?? 0}
            accent={statusColors.vehicleInProduction}
            snapshot
            to={vehicleStatLink('on_line', false)}
          />
          <KpiCard
            title={t('analysis.kpi.open')}
            value={dash?.KPIs.OpenIssuesInRange ?? 0}
            accent={statusColors.issueOpen}
            to={issueStatLink('open_active')}
          />
          <KpiCard
            title={t('analysis.kpi.done')}
            value={dash?.WorkSplit.Completed ?? 0}
            accent={statusColors.issueResolved}
            to={issueStatLink('completed')}
          />
          <KpiCard
            title={t('analysis.kpi.mttr')}
            value={
              dash?.KPIs.AvgResolutionHours == null
                ? t('common.emDash')
                : dash.KPIs.AvgResolutionHours.toFixed(2)
            }
            accent={statusColors.issueInProgress}
          />
          <KpiCard
            title={t('analysis.kpi.fpy')}
            value={
              dash?.KPIs.FirstTimeRightPercent == null
                ? t('common.emDash')
                : `${dash.KPIs.FirstTimeRightPercent}%`
            }
            accent={statusColors.issueDone}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartCard title={t('analysis.doneVsOpen')}>
            <div className="chart-inert h-[220px] w-full min-w-0 sm:h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart tabIndex={-1}>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius="70%"
                    isAnimationActive={false}
                    label={pieSliceLabel}
                    labelLine={false}
                    style={{ outline: 'none', cursor: 'default' }}
                    rootTabIndex={-1}
                  >
                    {pieData.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={entry.color}
                        style={{ outline: 'none', cursor: 'default' }}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend
                    wrapperStyle={{ fontSize: 12 }}
                    formatter={pieLegendFormatter}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard title={t('analysis.statusDist')}>
            <div className="chart-inert h-[220px] w-full min-w-0 sm:h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart tabIndex={-1}>
                  <Pie
                    data={statusPie}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius="70%"
                    isAnimationActive={false}
                    label={pieSliceLabel}
                    labelLine={false}
                    style={{ outline: 'none', cursor: 'default' }}
                    rootTabIndex={-1}
                  >
                    {statusPie.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={entry.color}
                        style={{ outline: 'none', cursor: 'default' }}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend
                    wrapperStyle={{ fontSize: 12 }}
                    formatter={pieLegendFormatter}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartCard title={t('analysis.stationMttr')}>
            <div className="chart-inert h-[220px] w-full min-w-0 sm:h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  tabIndex={-1}
                  data={mttrBars}
                  margin={{ top: 8, right: 8, left: 0, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="station"
                    tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    width={36}
                    tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                  />
                  <Tooltip />
                  <Bar dataKey="hours" fill={statusColors.info} name={t('analysis.mttrH')} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard title={t('analysis.top5')}>
            {topVehicles.length === 0 ? (
              <p className="py-8 text-[13px] text-[var(--text-secondary)]">
                {t('home.noOpenVehicles')}
              </p>
            ) : (
              <ol className="space-y-3">
                {topVehicles.map((row) => {
                  const raw = severityFillColor(row.worstSeverity);
                  const color =
                    row.worstSeverity === 'LOW' ? raw : muteColor(raw, 38);
                  return (
                    <li key={row.vin} className="flex items-center gap-3">
                      <span
                        className="w-5 shrink-0 text-right text-[13px] tabular-nums text-[var(--text-secondary)]"
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
        </div>

        <ChartCard title={t('analysis.pareto')}>
          <div className="chart-inert h-[220px] w-full min-w-0 sm:h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                tabIndex={-1}
                data={defectBars}
                margin={{ top: 8, right: 8, left: 0, bottom: 48 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="station"
                  tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                  angle={-35}
                  textAnchor="end"
                  height={60}
                  interval={0}
                />
                <YAxis
                  width={36}
                  tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                />
                <Tooltip />
                <Bar dataKey="issues" fill={statusColors.notOk} name={t('nav.issues')} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <div
          className="rounded-xl border bg-[var(--bg-surface-1)] p-4 sm:p-5"
          style={{ borderColor: 'var(--border)' }}
        >
          <h2 className="text-lg font-semibold">
            {t('analysis.vehicleBreakdown')}
          </h2>
          <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
            {t('analysis.vehicleBreakdownHint')}
          </p>

          <div className="chart-inert mt-4 h-48 w-full min-w-0 sm:h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                tabIndex={-1}
                data={stackedSeverity}
                margin={{ top: 8, right: 8, left: 0, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="vin"
                  tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  width={28}
                  tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="critical" stackId="a" fill={statusColors.severityCritical} name={t('severity.critical')} />
                <Bar dataKey="medium" stackId="a" fill={statusColors.severityMedium} name={t('severity.medium')} />
                <Bar dataKey="low" stackId="a" fill={statusColors.severityLow} name={t('severity.low')} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-4 space-y-3 sm:hidden">
            {severity.length === 0 && (
              <p className="text-[var(--text-secondary)]">
                {t('analysis.noOpenRows')}
              </p>
            )}
            {severity.map((row) => (
              <div
                key={row.VIN}
                className="space-y-2 rounded-lg border p-3"
                style={{ borderColor: 'var(--border)' }}
              >
                <Link
                  to={`/vehicles/${row.VIN}`}
                  className="font-medium text-[var(--accent)] hover:underline"
                >
                  …{row.VIN.slice(-5)}
                </Link>
                <p className="break-all text-[12px] text-[var(--text-secondary)]">
                  {row.VIN}
                </p>
                <div className="flex items-center justify-between text-[15px]">
                  <span className="text-[13px] text-[var(--text-secondary)]">{t('analysis.total')}</span>
                  <span>{row.TotalOpenIssues}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-[var(--text-secondary)]">{t('severity.critical')}</span>
                  <SeverityIndicator severity="CRITICAL" count={row.CriticalCount} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-[var(--text-secondary)]">{t('severity.medium')}</span>
                  <SeverityIndicator severity="MEDIUM" count={row.MediumCount} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-[var(--text-secondary)]">{t('severity.low')}</span>
                  <SeverityIndicator severity="LOW" count={row.LowCount} />
                </div>
              </div>
            ))}
          </div>

          <table className="mt-4 hidden w-full text-left text-[15px] sm:table">
            <thead>
              <tr className="text-[13px] text-[var(--text-secondary)]">
                <th className="pb-2 font-medium">{t('issue.vin')}</th>
                <th className="pb-2 font-medium">{t('analysis.total')}</th>
                <th className="pb-2 font-medium">{t('severity.critical')}</th>
                <th className="pb-2 font-medium">{t('severity.medium')}</th>
                <th className="pb-2 font-medium">{t('severity.low')}</th>
              </tr>
            </thead>
            <tbody>
              {severity.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-[var(--text-secondary)]">
                    {t('analysis.noOpenRows')}
                  </td>
                </tr>
              )}
              {severity.map((row) => (
                <tr
                  key={row.VIN}
                  className="border-t"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <td className="py-2.5">
                    <Link
                      to={`/vehicles/${row.VIN}`}
                      className="font-medium text-[var(--accent)] hover:underline"
                    >
                      …{row.VIN.slice(-5)}
                    </Link>
                    <span className="ml-2 break-all text-[13px] text-[var(--text-secondary)]">
                      {row.VIN}
                    </span>
                    <div className="text-[12px] text-[var(--text-secondary)]">
                      {t('analysis.openBreakdown', {
                        open: row.TotalOpenIssues,
                        critical: row.CriticalCount,
                        medium: row.MediumCount,
                        low: row.LowCount,
                      })}
                    </div>
                  </td>
                  <td className="py-2.5">{row.TotalOpenIssues}</td>
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
        </div>
      </div>
    </section>
  );
}

function pieSliceLabel({
  name,
  value,
}: {
  name?: string;
  value?: number;
}): string {
  if (!value) return '';
  return `${name} ${value}`;
}

function pieLegendFormatter(value: string, entry: { payload?: { value?: number } }) {
  const n = entry.payload?.value ?? 0;
  return `${value} (${n})`;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-[13px] text-[var(--text-secondary)]">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

function KpiCard({
  title,
  value,
  accent,
  to,
  snapshot,
}: {
  title: string;
  value: number | string;
  accent: string;
  to?: string;
  snapshot?: boolean;
}) {
  const { t } = useI18n();
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-medium text-[var(--text-primary)]">{title}</p>
        {snapshot && (
          <span
            className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
            style={{
              color: accent,
              backgroundColor: `color-mix(in srgb, ${accent} 16%, transparent)`,
            }}
          >
            {t('analysis.snapshot')}
          </span>
        )}
      </div>
      <p
        className="mt-2 text-2xl font-semibold tabular-nums"
        style={{ color: accent }}
      >
        {value}
      </p>
    </>
  );
  const style = {
    borderColor: `color-mix(in srgb, ${accent} 32%, var(--border))`,
    backgroundColor: `color-mix(in srgb, ${accent} 9%, var(--bg-surface-1))`,
  };
  if (to) {
    return (
      <Link
        to={to}
        className="rounded-xl border p-4 transition-colors hover:bg-[var(--bg-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        style={style}
      >
        {body}
      </Link>
    );
  }
  return (
    <div className="rounded-xl border p-4" style={style}>
      {body}
    </div>
  );
}

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="min-w-0 overflow-hidden rounded-xl border bg-[var(--bg-surface-1)] p-4 sm:p-5"
      style={{ borderColor: 'var(--border)' }}
    >
      <h2 className="mb-3 text-base font-semibold sm:text-lg">{title}</h2>
      {children}
    </div>
  );
}
