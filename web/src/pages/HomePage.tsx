import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  api,
  type DailyPendingIssue,
  type StationDefectRate,
  type StationMTTR,
  type VehicleSeverityBreakdown,
} from '../lib/api';
import { StatusBadge } from '../components/StatusBadge';

/** Home / Overview — §4.2: KPI strip + attention-needed table. */
export default function HomePage() {
  const [pending, setPending] = useState<DailyPendingIssue[]>([]);
  const [mttr, setMttr] = useState<StationMTTR[]>([]);
  const [defects, setDefects] = useState<StationDefectRate[]>([]);
  const [severity, setSeverity] = useState<VehicleSeverityBreakdown[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [p, m, d, s] = await Promise.all([
          api.dailyPendingIssues({}),
          api.mttr({}),
          api.defectRatePerStation({}),
          api.vehicleSeverityBreakdown({}),
        ]);
        if (cancelled) return;
        setPending(p.items ?? []);
        setMttr(m.items ?? []);
        setDefects(d.items ?? []);
        setSeverity(s.items ?? []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load KPIs');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const latestPending =
    pending.length > 0 ? pending[pending.length - 1].PendingCount : 0;
  const avgMttrHours =
    mttr.length > 0
      ? mttr.reduce((sum, r) => sum + nsToHours(r.MeanTimeToResolve), 0) /
        mttr.length
      : 0;
  const totalDefects = defects.reduce((sum, r) => sum + r.IssueCount, 0);
  const criticalVehicles = severity.filter((v) => v.CriticalCount > 0);

  return (
    <section>
      <h1 className="text-2xl font-semibold">Home / Overview</h1>
      <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
        KPI summary and vehicles needing attention
      </p>

      {error && (
        <p className="mt-4 text-[13px]" style={{ color: 'var(--status-not-ok)' }}>
          {error}
        </p>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard title="Daily Pending Issues" value={String(latestPending)} />
        <KpiCard title="Completed Today" value="—" hint="from completed-issues view" />
        <KpiCard
          title="Avg MTTR"
          value={avgMttrHours > 0 ? `${avgMttrHours.toFixed(1)} h` : '—'}
        />
        <KpiCard title="Defect Rate" value={String(totalDefects)} hint="total issues across stations" />
      </div>

      <div
        className="mt-8 rounded-xl border bg-[var(--bg-surface-1)] p-5"
        style={{ borderColor: 'var(--border)' }}
      >
        <h2 className="text-lg font-semibold">Dikkat Gerektiren Araçlar</h2>
        <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
          Vehicles with open critical issues
        </p>
        <table className="mt-4 w-full text-left text-[15px]">
          <thead>
            <tr className="text-[13px] text-[var(--text-secondary)]">
              <th className="pb-2 font-medium">VIN</th>
              <th className="pb-2 font-medium">Total open</th>
              <th className="pb-2 font-medium">Critical</th>
              <th className="pb-2 font-medium">Medium</th>
              <th className="pb-2 font-medium">Low</th>
            </tr>
          </thead>
          <tbody>
            {criticalVehicles.length === 0 && (
              <tr>
                <td colSpan={5} className="py-4 text-[var(--text-secondary)]">
                  No critical open issues
                </td>
              </tr>
            )}
            {criticalVehicles.map((row) => (
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
                </td>
                <td className="py-2.5">{row.TotalOpenIssues}</td>
                <td className="py-2.5">
                  <StatusBadge kind="severity" value="CRITICAL" />{' '}
                  {row.CriticalCount}
                </td>
                <td className="py-2.5">{row.MediumCount}</td>
                <td className="py-2.5">{row.LowCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function KpiCard({
  title,
  value,
  hint,
}: {
  title: string;
  value: string;
  hint?: string;
}) {
  return (
    <div
      className="rounded-xl border bg-[var(--bg-surface-1)] p-5"
      style={{ borderColor: 'var(--border)' }}
    >
      <p className="text-[13px] text-[var(--text-secondary)]">{title}</p>
      <p className="mt-2 text-3xl font-semibold text-[var(--text-primary)]">
        {value}
      </p>
      {hint && (
        <p className="mt-1 text-[12px] text-[var(--text-secondary)]">{hint}</p>
      )}
    </div>
  );
}

function nsToHours(ns: number): number {
  // Go time.Duration marshals as nanoseconds when numeric
  return ns / 1e9 / 3600;
}
