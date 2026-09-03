import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, type Station, type Vehicle } from '../lib/api';
import { VehicleStatusDisplay } from '../components/VehicleStatusDisplay';
import { VinSearchBox } from '../components/VinSearchBox';
import { VehicleIdentity } from '../components/VehicleIdentity';
import {
  DataCard,
  DataCardField,
  DesktopTableShell,
  MobileCardStack,
} from '../components/DataCard';
import { brandColors } from '../theme/tokens';
import { useI18n, type MessageKey } from '../i18n';
import {
  EOL_STAGE_FILTER_VALUES,
  VEHICLE_STATUS_FILTER_VALUES,
  eolStageLabel,
  isOpenIssueStatus,
  vehicleStatusLabel,
} from '../lib/vehicleStatus';
import { VehicleListPrint } from '../components/print/VehicleListPrint';

const STATUSES = ['', ...VEHICLE_STATUS_FILTER_VALUES] as const;

const ANALYSIS_STAT_KEYS: Record<string, MessageKey> = {
  on_line: 'vehicles.inProductionNow',
  shipped_today: 'vehicles.shippedToday',
  shipped_week: 'vehicles.shippedWeek',
  depot_released: 'vehicles.depotRelease',
};

function compareVinDesc(a: Vehicle, b: Vehicle): number {
  return b.VIN.localeCompare(a.VIN);
}

/** Vehicle list — §4.3 filterable table; stacked cards below tablet. */
export default function VehiclesPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const vin = searchParams.get('vin') ?? '';
  const status = searchParams.get('status') ?? '';
  const eolStage = searchParams.get('eol_stage') ?? '';
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
          eol_stage: analysisStat ? undefined : eolStage || undefined,
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
          setError(err instanceof Error ? err.message : t('vehicles.loadFailed'));
          setItems([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vin, status, eolStage, page, analysisStat, from, to, t]);

  const analysisKey = ANALYSIS_STAT_KEYS[analysisStat];
  const analysisLabel = analysisKey ? t(analysisKey) : undefined;

  async function collectPrint() {
    const all: Vehicle[] = [];
    let p = 1;
    let totalCount = Infinity;
    while (all.length < totalCount) {
      const res = await api.listVehicles({
        vin: vin || undefined,
        status: analysisStat ? undefined : status || undefined,
        eol_stage: analysisStat ? undefined : eolStage || undefined,
        page: p,
        analysis_stat: analysisStat || undefined,
        from: analysisStat && analysisStat !== 'on_line' ? from || undefined : undefined,
        to: analysisStat && analysisStat !== 'on_line' ? to || undefined : undefined,
      });
      const batch = res.Items ?? [];
      totalCount = res.Total ?? batch.length;
      all.push(...batch);
      if (batch.length === 0) break;
      p += 1;
    }
    const [stationRes, issueRes] = await Promise.all([
      api.listStations().catch(() => ({ items: [] as Station[] })),
      api.listIssues().catch(() => ({ items: [] })),
    ]);
    const stations = stationRes.items ?? [];
    const byStation = new Map(stations.map((s) => [s.ID, s.Name]));
    const openByVin: Record<string, number> = {};
    for (const issue of issueRes.items ?? []) {
      if (isOpenIssueStatus(issue.Status)) {
        openByVin[issue.VIN] = (openByVin[issue.VIN] ?? 0) + 1;
      }
    }
    const filters: string[] = [];
    if (vin) filters.push(t('print.filterVin', { vin }));
    if (!analysisStat && status) {
      filters.push(t('print.filterStatus', { status: vehicleStatusLabel(status, t) }));
    }
    if (!analysisStat && eolStage) {
      filters.push(t('print.filterEolStage', { stage: eolStageLabel(eolStage, t) }));
    }
    if (analysisLabel) {
      const range =
        analysisStat !== 'on_line' && (from || to)
          ? t('print.filterRange', { from: from || '…', to: to || '…' })
          : '';
      filters.push(
        range
          ? `${t('print.filterAnalysis', { label: analysisLabel })} (${range})`
          : t('print.filterAnalysis', { label: analysisLabel }),
      );
    }
    return {
      vehicles: all.slice().sort(compareVinDesc),
      filters,
      stationName: (id: number | null) =>
        id == null ? t('common.emDash') : byStation.get(id) ?? String(id),
      openIssueCount: (v: string) => openByVin[v] ?? 0,
    };
  }

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold sm:text-2xl">{t('vehicles.title')}</h1>
          <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
            {t('vehicles.subtitle')}
          </p>
        </div>
        <VehicleListPrint disabled={loading} onCollect={collectPrint} />
      </div>

      {analysisLabel && (
        <div
          className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-[var(--bg-surface-1)] px-4 py-3"
          style={{ borderColor: 'var(--border)' }}
        >
          <p className="text-[13px] text-[var(--text-primary)]">
            {analysisStat !== 'on_line' && (from || to)
              ? t('issue.analysisFilterRange', {
                  label: analysisLabel,
                  range: t('analysis.to', { from: from || '…', to: to || '…' }),
                  n: total,
                })
              : t('issue.analysisFilter', { label: analysisLabel, n: total })}
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
            {t('common.clear')}
          </button>
        </div>
      )}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="w-full sm:w-64">
          <label className="text-[13px] text-[var(--text-secondary)]">
            {t('vehicles.vinSearch')}
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
            {t('issue.status')}
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
                {vehicleStatusLabel(s, t)}
              </option>
            ))}
          </select>
        </div>
        <div className="w-full sm:w-auto">
          <label className="text-[13px] text-[var(--text-secondary)]">
            {t('print.eolStage')}
          </label>
          <select
            value={eolStage}
            onChange={(e) => {
              const nextStage = e.target.value;
              patchParams((next) => {
                next.delete('analysisStat');
                next.delete('from');
                next.delete('to');
                if (nextStage) next.set('eol_stage', nextStage);
                else next.delete('eol_stage');
                next.delete('page');
              });
            }}
            className="mt-1 block min-h-touch w-full rounded-lg border bg-[var(--bg-surface-1)] px-3 py-2 text-[15px] sm:w-auto"
            style={{ borderColor: 'var(--border)' }}
          >
            <option value="">{t('status.vehicle.all')}</option>
            {EOL_STAGE_FILTER_VALUES.map((s) => (
              <option key={s} value={s}>
                {eolStageLabel(s, t)}
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
                {t('vehicles.notFound')}
              </p>
            ) : null
          }
        >
          {loading && (
            <p className="text-[var(--text-secondary)]">{t('common.loading')}</p>
          )}
          {items.map((v) => (
            <Link
              key={v.VIN}
              to={`/vehicles/${v.VIN}`}
              className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              <DataCard className="cursor-pointer transition-colors hover:bg-[var(--bg-surface-2)]">
                <VehicleIdentity vin={v.VIN} variant="compact" />
                <DataCardField label={t('issue.status')}>
                  <VehicleStatusDisplay
                    status={v.CurrentGlobalStatus}
                    eolStage={v.CurrentEOLStage}
                  />
                </DataCardField>
                <DataCardField label={t('vehicles.station')}>
                  {v.CurrentStationID ?? t('common.emDash')}
                </DataCardField>
                <DataCardField label={t('vehicles.completion')}>
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
                <th className="px-4 py-3 font-medium">{t('issue.vin')}</th>
                <th className="px-4 py-3 font-medium">{t('issue.status')}</th>
                <th className="px-4 py-3 font-medium">{t('vehicles.station')}</th>
                <th className="px-4 py-3 font-medium">{t('vehicles.completionPct')}</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-[var(--text-secondary)]">
                    {t('common.loading')}
                  </td>
                </tr>
              )}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-[var(--text-secondary)]">
                    {t('vehicles.notFound')}
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
                    <VehicleIdentity vin={v.VIN} variant="compact" />
                  </td>
                  <td className="px-4 py-3">
                    <VehicleStatusDisplay
                      status={v.CurrentGlobalStatus}
                      eolStage={v.CurrentEOLStage}
                    />
                  </td>
                  <td className="px-4 py-3">{v.CurrentStationID ?? t('common.emDash')}</td>
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
          {t('vehicles.pagination', { total, page })}
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
          {t('common.prev')}
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
          {t('common.next')}
        </button>
      </div>
    </section>
  );
}
