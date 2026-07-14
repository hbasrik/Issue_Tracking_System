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
  type StationDefectRate,
  type StationMTTR,
  type VehicleSeverityBreakdown,
} from '../lib/api';
import { VinSearchBox } from '../components/VinSearchBox';
import { statusColors } from '../theme/tokens';

const VEHICLE_STATUSES = [
  '',
  'IN_PRODUCTION',
  'IN_WAREHOUSE',
  'WITH_CUSTOMER',
  'SHIPPED',
  'ON_HOLD',
] as const;

/**
 * Analysis tab — §4.4: filter bar, pie + bar charts, VIN severity breakdown,
 * Export/Print to A4 PDF via jspdf + html2canvas.
 */
export default function AnalysisPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const exportRef = useRef<HTMLDivElement>(null);

  // Draft filters (applied on "Uygula")
  const [draftFrom, setDraftFrom] = useState(searchParams.get('from') ?? '');
  const [draftTo, setDraftTo] = useState(searchParams.get('to') ?? '');
  const [draftPhase, setDraftPhase] = useState(searchParams.get('phase') ?? '');
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
      phase: searchParams.get('phase') ?? undefined,
      status: searchParams.get('status') ?? undefined,
      issue_type: searchParams.get('issue_type') ?? undefined,
    }),
    [searchParams],
  );

  const [severity, setSeverity] = useState<VehicleSeverityBreakdown[]>([]);
  const [mttr, setMttr] = useState<StationMTTR[]>([]);
  const [defects, setDefects] = useState<StationDefectRate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [s, m, d] = await Promise.all([
        api.vehicleSeverityBreakdown(applied),
        api.mttr(applied),
        api.defectRatePerStation(applied),
      ]);
      setSeverity(s.items ?? []);
      setMttr(m.items ?? []);
      setDefects(d.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analysis');
    }
  }, [applied]);

  useEffect(() => {
    void load();
  }, [load]);

  function applyFilters() {
    const next = new URLSearchParams();
    if (draftFrom) next.set('from', draftFrom);
    if (draftTo) next.set('to', draftTo);
    if (draftPhase) next.set('phase', draftPhase);
    if (draftStatus) next.set('status', draftStatus);
    if (draftIssueType) next.set('issue_type', draftIssueType);
    if (draftVin.trim()) next.set('vin_suffix', draftVin.trim());
    setSearchParams(next);
  }

  const pieData = useMemo(() => {
    // Approximate completion split from severity rows + defect context.
    // Prefer vehicles with zero open issues as "completed-leaning" when no
    // dedicated completion endpoint is exposed yet.
    const withOpen = severity.filter((v) => v.TotalOpenIssues > 0).length;
    const withoutOpen = Math.max(0, severity.length - withOpen);
    // If no severity rows, fall back to a neutral placeholder from defects.
    if (severity.length === 0) {
      return [
        { name: 'Completed', value: 0, color: statusColors.ok },
        { name: 'In progress', value: Math.max(1, defects.length), color: statusColors.info },
      ];
    }
    return [
      { name: 'Completed (no open issues)', value: withoutOpen, color: statusColors.ok },
      { name: 'In progress (open issues)', value: withOpen, color: statusColors.info },
    ];
  }, [severity, defects]);

  const mttrBars = useMemo(
    () =>
      mttr.map((r) => ({
        station: `Station ${r.StationID}`,
        hours: Number((r.MeanTimeToResolve / 1e9 / 3600).toFixed(2)),
      })),
    [mttr],
  );

  const defectBars = useMemo(
    () =>
      [...defects]
        .sort((a, b) => b.IssueCount - a.IssueCount)
        .map((r) => ({
          station: r.StationName || `Station ${r.StationID}`,
          issues: r.IssueCount,
        })),
    [defects],
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
      setError(err instanceof Error ? err.message : 'PDF export failed');
    } finally {
      setExporting(false);
    }
  }

  const filterSummary = [
    applied.from && `from ${applied.from}`,
    applied.to && `to ${applied.to}`,
    applied.phase && `phase ${applied.phase}`,
    applied.status && `status ${applied.status}`,
    applied.issue_type && `issue type ${applied.issue_type}`,
    applied.vin_suffix && `VIN …${applied.vin_suffix}`,
  ]
    .filter(Boolean)
    .join(' · ') || 'No filters (all data)';

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Analysis</h1>
          <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
            Filters, charts, and vehicle severity breakdown
          </p>
        </div>
        <button
          type="button"
          onClick={exportPdf}
          disabled={exporting}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-[15px] font-medium text-white disabled:opacity-60"
        >
          {exporting ? 'Exporting…' : 'Export / Print'}
        </button>
      </div>

      {/* Filter bar — §4.4 */}
      <div
        className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border bg-[var(--bg-surface-1)] p-4"
        style={{ borderColor: 'var(--border)' }}
      >
        <Field label="From">
          <input
            type="date"
            value={draftFrom}
            onChange={(e) => setDraftFrom(e.target.value)}
            className="rounded-lg border bg-[var(--bg-page)] px-3 py-2 text-[15px]"
            style={{ borderColor: 'var(--border)' }}
          />
        </Field>
        <Field label="To">
          <input
            type="date"
            value={draftTo}
            onChange={(e) => setDraftTo(e.target.value)}
            className="rounded-lg border bg-[var(--bg-page)] px-3 py-2 text-[15px]"
            style={{ borderColor: 'var(--border)' }}
          />
        </Field>
        <Field label="Phase">
          <select
            value={draftPhase}
            onChange={(e) => setDraftPhase(e.target.value)}
            className="rounded-lg border bg-[var(--bg-page)] px-3 py-2 text-[15px]"
            style={{ borderColor: 'var(--border)' }}
          >
            <option value="">All</option>
            {Array.from({ length: 8 }, (_, i) => i + 1).map((p) => (
              <option key={p} value={String(p)}>
                Phase {p}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Vehicle status">
          <select
            value={draftStatus}
            onChange={(e) => setDraftStatus(e.target.value)}
            className="rounded-lg border bg-[var(--bg-page)] px-3 py-2 text-[15px]"
            style={{ borderColor: 'var(--border)' }}
          >
            {VEHICLE_STATUSES.map((s) => (
              <option key={s || 'all'} value={s}>
                {s || 'All'}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Issue type">
          <input
            type="text"
            value={draftIssueType}
            onChange={(e) => setDraftIssueType(e.target.value)}
            placeholder="e.g. Electrical"
            className="w-40 rounded-lg border bg-[var(--bg-page)] px-3 py-2 text-[15px]"
            style={{ borderColor: 'var(--border)' }}
          />
        </Field>
        <Field label="VIN suffix">
          <VinSearchBox
            value={draftVin}
            onChange={setDraftVin}
            showResults={false}
            className="w-48"
          />
        </Field>
        <button
          type="button"
          onClick={applyFilters}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-[15px] text-white"
        >
          Uygula
        </button>
      </div>

      {error && (
        <p className="mt-4 text-[13px]" style={{ color: 'var(--status-not-ok)' }}>
          {error}
        </p>
      )}

      <div ref={exportRef} className="mt-6 space-y-6 bg-[var(--bg-page)] p-1">
        <p className="text-[13px] text-[var(--text-secondary)]">
          Active filters: {filterSummary}
        </p>

        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Biten / Devam Eden İşler">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  label
                >
                  {pieData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="İstasyon Bazlı MTTR (hours)">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={mttrBars}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="station" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="hours" fill={statusColors.info} name="MTTR (h)" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <ChartCard title="Defect Rate per Station (Pareto)">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={defectBars}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="station" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
              <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="issues" fill={statusColors.notOk} name="Issues" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <div
          className="rounded-xl border bg-[var(--bg-surface-1)] p-5"
          style={{ borderColor: 'var(--border)' }}
        >
          <h2 className="text-lg font-semibold">
            Araç Bazlı Açık Hata Dağılımı
          </h2>
          <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
            VIN × severity (Decision Log #7) — sorted by total open issues
          </p>

          <div className="mt-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stackedSeverity}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="vin" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="critical" stackId="a" fill={statusColors.severityCritical} name="Critical" />
                <Bar dataKey="medium" stackId="a" fill={statusColors.severityMedium} name="Medium" />
                <Bar dataKey="low" stackId="a" fill={statusColors.severityLow} name="Low" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <table className="mt-4 w-full text-left text-[15px]">
            <thead>
              <tr className="text-[13px] text-[var(--text-secondary)]">
                <th className="pb-2 font-medium">VIN</th>
                <th className="pb-2 font-medium">Total</th>
                <th className="pb-2 font-medium">Critical</th>
                <th className="pb-2 font-medium">Medium</th>
                <th className="pb-2 font-medium">Low</th>
              </tr>
            </thead>
            <tbody>
              {severity.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-[var(--text-secondary)]">
                    No open-issue rows for current filters
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
                    <span className="ml-2 text-[13px] text-[var(--text-secondary)]">
                      {row.VIN}
                    </span>
                    <div className="text-[12px] text-[var(--text-secondary)]">
                      {row.TotalOpenIssues} open — {row.CriticalCount} critical,{' '}
                      {row.MediumCount} medium, {row.LowCount} low
                    </div>
                  </td>
                  <td className="py-2.5">{row.TotalOpenIssues}</td>
                  <td className="py-2.5">{row.CriticalCount}</td>
                  <td className="py-2.5">{row.MediumCount}</td>
                  <td className="py-2.5">{row.LowCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
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

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl border bg-[var(--bg-surface-1)] p-5"
      style={{ borderColor: 'var(--border)' }}
    >
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      {children}
    </div>
  );
}
