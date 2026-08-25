import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, type Vehicle } from '../lib/api';
import { StatusBadge } from '../components/StatusBadge';
import { VinSearchBox } from '../components/VinSearchBox';
import { VehicleIdentity } from '../components/VehicleIdentity';
import {
  DataCard,
  DataCardField,
  DesktopTableShell,
  MobileCardStack,
} from '../components/DataCard';
import { brandColors } from '../theme/tokens';

const STATUSES = [
  '',
  'IN_PRODUCTION',
  'IN_WAREHOUSE',
  'WITH_CUSTOMER',
  'SHIPPED',
  'ON_HOLD',
] as const;

const ANALYSIS_STAT_LABELS: Record<string, string> = {
  on_line: 'Hattaki araçlar (IN_PRODUCTION, anlık)',
  shipped_today: 'Bugün sevk',
  shipped_week: 'Haftalık sevk',
  depot_released: 'Depo serbest',
};

function compareVinDesc(a: Vehicle, b: Vehicle): number {
  return b.VIN.localeCompare(a.VIN);
}

/** Vehicle list — §4.3 filterable table; stacked cards below tablet. */
export default function VehiclesPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const vin = searchParams.get('vin') ?? '';
  const status = searchParams.get('status') ?? '';
  const analysisStat = searchParams.get('analysisStat') ?? '';
  const from = searchParams.get('from') ?? '';
  const to = searchParams.get('to') ?? '';
  const page = Math.max(1, Number(searchParams.get('page') || '1') || 1);

  const [items, setItems] = useState<Vehicle[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function patchParams(mutate: (next: URLSearchParams) => void) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        mutate(next);
        return next;
      },
      { replace: true },
    );
  }

  function clearAnalysisStat() {
    patchParams((next) => {
      next.delete('analysisStat');
      next.delete('from');
      next.delete('to');
      next.delete('page');
    });
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.listVehicles({
          vin: vin || undefined,
          status: analysisStat ? undefined : status || undefined,
          page,
          analysis_stat: analysisStat || undefined,
          from: analysisStat && analysisStat !== 'on_line' ? from || undefined : undefined,
          to: analysisStat && analysisStat !== 'on_line' ? to || undefined : undefined,
        });
        if (cancelled) return;
        setItems((res.Items ?? []).slice().sort(compareVinDesc));
        setTotal(res.Total ?? 0);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load vehicles');
          setItems([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vin, status, page, analysisStat, from, to]);

  const analysisLabel = ANALYSIS_STAT_LABELS[analysisStat];

  return (
    <section>
      <h1 className="text-xl font-semibold sm:text-2xl">Vehicles</h1>
      <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
        Filterable vehicle table
      </p>

      {analysisLabel && (
        <div
          className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-[var(--bg-surface-1)] px-4 py-3"
          style={{ borderColor: 'var(--border)' }}
        >
          <p className="text-[13px] text-[var(--text-primary)]">
            Analiz filtre: {analysisLabel}
            {analysisStat !== 'on_line' && (from || to)
              ? ` · ${from || '…'} → ${to || '…'}`
              : ''}
            {' · '}
            {total} kayıt
          </p>
          <button
            type="button"
            onClick={clearAnalysisStat}
            className="min-h-touch rounded-lg border px-3 py-1.5 text-[13px]"
            style={{
              borderColor: 'var(--border)',
              color: brandColors.secondary,
            }}
          >
            Temizle
          </button>
        </div>
      )}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="w-full sm:w-64">
          <label className="text-[13px] text-[var(--text-secondary)]">
            VIN search
          </label>
          <VinSearchBox
            value={vin}
            onChange={(s) => {
              patchParams((next) => {
                if (s) next.set('vin', s);
                else next.delete('vin');
                next.delete('page');
              });
            }}
            showResults={false}
            className="mt-1"
          />
        </div>
        <div className="w-full sm:w-auto">
          <label className="text-[13px] text-[var(--text-secondary)]">
            Status
          </label>
          <select
            value={status}
            onChange={(e) => {
              const nextStatus = e.target.value;
              patchParams((next) => {
                next.delete('analysisStat');
                next.delete('from');
                next.delete('to');
                if (nextStatus) next.set('status', nextStatus);
                else next.delete('status');
                next.delete('page');
              });
            }}
            className="mt-1 block min-h-touch w-full rounded-lg border bg-[var(--bg-surface-1)] px-3 py-2 text-[15px] sm:w-auto"
            style={{ borderColor: 'var(--border)' }}
          >
            {STATUSES.map((s) => (
              <option key={s || 'all'} value={s}>
                {s || 'All statuses'}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <p className="mt-4 text-[13px]" style={{ color: 'var(--status-not-ok)' }}>
          {error}
        </p>
      )}

      <div className="mt-4">
        <MobileCardStack
          empty={
            !loading && items.length === 0 ? (
              <p className="text-[15px] text-[var(--text-secondary)]">
                No vehicles found
              </p>
            ) : null
          }
        >
          {loading && (
            <p className="text-[var(--text-secondary)]">Loading…</p>
          )}
          {items.map((v) => (
            <Link
              key={v.VIN}
              to={`/vehicles/${v.VIN}`}
              className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              <DataCard className="cursor-pointer transition-colors hover:bg-[var(--bg-surface-2)]">
                <VehicleIdentity vin={v.VIN} compact />
                <DataCardField label="Model">
                  {v.VehicleModelID != null ? `#${v.VehicleModelID}` : '—'}
                </DataCardField>
                <DataCardField label="Status">
                  <StatusBadge kind="vehicle" value={v.CurrentGlobalStatus} />
                </DataCardField>
                <DataCardField label="Station">
                  {v.CurrentStationID ?? '—'}
                </DataCardField>
                <DataCardField label="Completion">
                  {Number(v.TotalProgressPercentage).toFixed(1)}%
                </DataCardField>
              </DataCard>
            </Link>
          ))}
        </MobileCardStack>

        <DesktopTableShell>
          <table className="w-full text-left text-[15px]">
            <thead>
              <tr
                className="border-b text-[13px] text-[var(--text-secondary)]"
                style={{ borderColor: 'var(--border)' }}
              >
                <th className="px-4 py-3 font-medium">VIN</th>
                <th className="px-4 py-3 font-medium">Model</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Station</th>
                <th className="px-4 py-3 font-medium">Completion %</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-[var(--text-secondary)]">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-[var(--text-secondary)]">
                    No vehicles found
                  </td>
                </tr>
              )}
              {items.map((v) => (
                <tr
                  key={v.VIN}
                  role="link"
                  tabIndex={0}
                  className="cursor-pointer border-t transition-colors hover:bg-[var(--bg-surface-2)]"
                  style={{ borderColor: 'var(--border)' }}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey) {
                      window.open(`/vehicles/${v.VIN}`, '_blank');
                      return;
                    }
                    navigate(`/vehicles/${v.VIN}`);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      navigate(`/vehicles/${v.VIN}`);
                    }
                  }}
                >
                  <td className="px-4 py-3">
                    <VehicleIdentity vin={v.VIN} compact />
                  </td>
                  <td className="px-4 py-3">
                    {v.VehicleModelID != null ? `#${v.VehicleModelID}` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge kind="vehicle" value={v.CurrentGlobalStatus} />
                  </td>
                  <td className="px-4 py-3">{v.CurrentStationID ?? '—'}</td>
                  <td className="px-4 py-3">
                    {Number(v.TotalProgressPercentage).toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DesktopTableShell>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-[13px] text-[var(--text-secondary)]">
        <span>
          {total} total · page {page}
        </span>
        <button
          type="button"
          disabled={page <= 1}
          onClick={() =>
            patchParams((next) => {
              next.set('page', String(page - 1));
            })
          }
          className="min-h-touch rounded border px-3 disabled:opacity-40"
          style={{ borderColor: 'var(--border)' }}
        >
          Prev
        </button>
        <button
          type="button"
          disabled={items.length === 0}
          onClick={() =>
            patchParams((next) => {
              next.set('page', String(page + 1));
            })
          }
          className="min-h-touch rounded border px-3 disabled:opacity-40"
          style={{ borderColor: 'var(--border)' }}
        >
          Next
        </button>
      </div>
    </section>
  );
}
