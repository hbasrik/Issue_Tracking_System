import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { VehicleIdentity } from '../components/VehicleIdentity';
import { ChecklistPanel } from '../components/ChecklistPanel';
import { EolWorkflowTab } from '../components/EolWorkflowTab';
import { MediaGallery } from '../components/MediaGallery';
import { VehicleIssuesPanel } from '../components/VehicleIssuesPanel';
import { ShipmentReadinessBanner } from '../components/ShipmentReadinessBanner';
import { StationStepsPanel } from '../components/StationStepsPanel';
import { VehicleStatusHistory } from '../components/VehicleStatusHistory';
import { ActionStamp } from '../components/ActionStamp';
import { VehicleStatusDisplay } from '../components/VehicleStatusDisplay';
import { useConfirm } from '../components/ConfirmDialog';
import {
  api,
  type ShipmentReadiness,
  type Station,
  type Vehicle,
  type VehicleStatusHistoryEntry,
} from '../lib/api';
import { apiErrorMessage } from '../lib/apiErrors';
import { useAuth } from '../auth/AuthProvider';
import { Perm } from '../auth/permissions';
import { useI18n } from '../i18n';
import { formatActionStamp } from '../lib/actionStamp';
import type { MessageKey } from '../../../shared/i18n';

type Tab = 'overview' | 'eol' | 'shipment' | 'test' | 'issues' | 'audit';

function isTab(value: string | null): value is Tab {
  return (
    value === 'overview' ||
    value === 'eol' ||
    value === 'shipment' ||
    value === 'test' ||
    value === 'issues' ||
    value === 'audit'
  );
}

const TAB_DEFS: { id: Tab; labelKey: MessageKey; perm?: string }[] = [
  { id: 'overview', labelKey: 'vehicles.tab.overview' },
  { id: 'shipment', labelKey: 'vehicles.tab.shipment', perm: Perm.ChecklistShipmentView },
  { id: 'test', labelKey: 'vehicles.tab.test', perm: Perm.ChecklistTestView },
  { id: 'eol', labelKey: 'vehicles.tab.eol', perm: Perm.ChecklistEOLView },
  { id: 'issues', labelKey: 'vehicles.tab.issues', perm: Perm.IssueView },
  { id: 'audit', labelKey: 'vehicles.tab.audit' },
];

function canPlaceOnHold(status: string): boolean {
  return status === 'IN_PRODUCTION' || status === 'IN_WAREHOUSE';
}

/** Vehicle detail with Overview / EoL / Shipment / Test / Issues / Audit Log tabs. */
export default function VehicleDetailPage() {
  const { t, locale } = useI18n();
  const confirm = useConfirm();
  const { vin = '' } = useParams();
  const { has } = useAuth();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => {
    const fromUrl = searchParams.get('tab');
    return isTab(fromUrl) ? fromUrl : 'overview';
  });
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [stations, setStations] = useState<Station[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [holdReason, setHoldReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [readiness, setReadiness] = useState<ShipmentReadiness | null>(null);
  const [statusHistory, setStatusHistory] = useState<VehicleStatusHistoryEntry[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const loadVehicle = useCallback(async () => {
    const v = await api.getVehicle(vin);
    setVehicle(v);
    const [ready, historyRes] = await Promise.all([
      has(Perm.ChecklistShipmentView)
        ? api.shipmentReadiness(vin).catch(() => null)
        : Promise.resolve(null),
      api.getVehicleStatusHistory(vin).catch(() => {
        setHistoryError(t('vehicles.historyFailed'));
        return { items: [] as VehicleStatusHistoryEntry[] };
      }),
    ]);
    setReadiness(ready);
    setStatusHistory(historyRes.items ?? []);
    if (historyRes.items) setHistoryError(null);
  }, [vin, has, t]);

  useEffect(() => {
    const fromUrl = searchParams.get('tab');
    setTab(isTab(fromUrl) ? fromUrl : 'overview');
  }, [vin, searchParams]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError(null);
      try {
        const [v, stationRes, ready, historyRes] = await Promise.all([
          api.getVehicle(vin),
          api.listStations().catch(() => ({ items: [] as Station[] })),
          has(Perm.ChecklistShipmentView)
            ? api.shipmentReadiness(vin).catch(() => null)
            : Promise.resolve(null),
          api.getVehicleStatusHistory(vin).catch(() => ({ items: [] as VehicleStatusHistoryEntry[] })),
        ]);
        if (cancelled) return;
        setVehicle(v);
        setStations(stationRes.items ?? []);
        setReadiness(ready);
        setStatusHistory(historyRes.items ?? []);
        setHistoryError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t('vehicles.loadOneFailed'));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vin, has, t]);

  async function placeOnHold() {
    if (!vehicle) return;
    const reason = holdReason.trim();
    if (!reason) {
      setError(t('vehicles.holdReasonRequired'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await api.placeOnHold(vehicle.VIN, reason);
      setVehicle(updated);
      setHoldReason('');
      const historyRes = await api.getVehicleStatusHistory(vehicle.VIN);
      setStatusHistory(historyRes.items ?? []);
      setHistoryError(null);
    } catch (err) {
      setError(err instanceof Error ? apiErrorMessage(err, t) : t('vehicles.holdFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function releaseFromHold() {
    if (!vehicle) return;
    const ok = await confirm({
      title: t('vehicles.releaseFromHold'),
      message: t('vehicles.holdHint'),
      confirmLabel: t('vehicles.releaseFromHold'),
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api.releaseFromHold(vehicle.VIN);
      setVehicle(updated);
      const historyRes = await api.getVehicleStatusHistory(vehicle.VIN);
      setStatusHistory(historyRes.items ?? []);
      setHistoryError(null);
    } catch (err) {
      setError(err instanceof Error ? apiErrorMessage(err, t) : t('vehicles.holdFailed'));
    } finally {
      setBusy(false);
    }
  }

  const visibleTabs = TAB_DEFS.filter((tabItem) => !tabItem.perm || has(tabItem.perm));
  const activeTab = visibleTabs.some((tabItem) => tabItem.id === tab) ? tab : 'overview';
  const manageHold = has(Perm.AdminManageMasters);

  if (error && !vehicle) {
    return (
      <section>
        <Link to="/vehicles" className="text-[13px] text-[var(--accent)]">
          {t('vehicles.backToList')}
        </Link>
        <p className="mt-4" style={{ color: 'var(--status-not-ok)' }}>
          {error}
        </p>
      </section>
    );
  }

  if (!vehicle) {
    return <p className="text-[var(--text-secondary)]">{t('common.loading')}</p>;
  }

  const pct = Number(vehicle.TotalProgressPercentage);
  const currentStation = stations.find((s) => s.ID === vehicle.CurrentStationID);
  const lastStatusChange = statusHistory[statusHistory.length - 1];
  const lastStamp = lastStatusChange
    ? formatActionStamp(lastStatusChange.ActorName, lastStatusChange.EventAt, locale)
    : null;
  const onHold = vehicle.CurrentGlobalStatus === 'ON_HOLD';

  return (
    <section>
      <Link to="/vehicles" className="text-[13px] text-[var(--accent)]">
        {t('vehicles.backToList')}
      </Link>
      <div className="mt-4 flex flex-wrap items-start gap-4 sm:gap-6">
        <ProgressRing
          percentage={pct}
          ariaLabel={t('common.percentComplete', { n: pct.toFixed(0) })}
        />
        <div className="min-w-0 flex-1">
          <VehicleIdentity vin={vehicle.VIN} />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <VehicleStatusDisplay
              status={vehicle.CurrentGlobalStatus}
              eolStage={vehicle.CurrentEOLStage}
            />
            <span className="text-[13px] text-[var(--text-secondary)]">
              {currentStation
                ? t('vehicles.seq', { name: currentStation.Name, n: currentStation.SequenceNo })
                : t('vehicles.noStation')}
              {' · '}
              {vehicle.VehicleModelID != null
                ? t('common.modelN', { id: vehicle.VehicleModelID })
                : t('vehicles.noModel')}
            </span>
          </div>
          {lastStamp ? <ActionStamp lines={[lastStamp]} /> : null}
        </div>
      </div>

      {vehicle.CurrentGlobalStatus !== 'SHIPPED' && has(Perm.ChecklistShipmentView) ? (
        <div className="mt-5">
          <ShipmentReadinessBanner readiness={readiness} />
        </div>
      ) : null}

      <div
        className="-mx-3 mt-6 flex gap-1 overflow-x-auto border-b px-3 sm:mx-0 sm:px-0"
        style={{ borderColor: 'var(--border)' }}
        role="tablist"
      >
        {visibleTabs.map((tabItem) => (
          <button
            key={tabItem.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tabItem.id}
            onClick={() => setTab(tabItem.id)}
            className={`min-h-touch shrink-0 whitespace-nowrap px-3 text-[15px] sm:px-4 ${
              activeTab === tabItem.id
                ? 'border-b-2 border-[var(--accent)] font-medium text-[var(--accent)]'
                : 'text-[var(--text-secondary)]'
            }`}
          >
            {t(tabItem.labelKey)}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {activeTab === 'overview' && (
          <div className="space-y-5">
            <div
              className="rounded-xl border bg-[var(--bg-surface-1)] p-5"
              style={{ borderColor: 'var(--border)' }}
            >
              <h2 className="text-lg font-semibold">{t('vehicles.holdTitle')}</h2>
              <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
                {t('vehicles.statusEditorHint')}
              </p>
              <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
                {t('vehicles.holdHint')}
              </p>
              {onHold && vehicle.HoldReason ? (
                <p className="mt-3 text-[13px] text-[var(--text-primary)]">
                  {t('vehicles.holdReason')}: {vehicle.HoldReason}
                </p>
              ) : null}
              {manageHold && onHold ? (
                <div className="mt-4">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void releaseFromHold()}
                    className="min-h-touch rounded-lg bg-[var(--accent)] px-4 text-[15px] text-white disabled:opacity-60"
                  >
                    {t('vehicles.releaseFromHold')}
                  </button>
                </div>
              ) : null}
              {manageHold && !onHold && canPlaceOnHold(vehicle.CurrentGlobalStatus) ? (
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                  <div className="min-w-0 flex-1 sm:max-w-md">
                    <label className="text-[13px] text-[var(--text-secondary)]">
                      {t('vehicles.holdReason')}
                    </label>
                    <input
                      type="text"
                      value={holdReason}
                      onChange={(e) => setHoldReason(e.target.value)}
                      className="mt-1 min-h-touch w-full rounded-lg border bg-[var(--bg-page)] px-3 text-[15px]"
                      style={{ borderColor: 'var(--border)' }}
                    />
                  </div>
                  <button
                    type="button"
                    disabled={busy || !holdReason.trim()}
                    onClick={() => void placeOnHold()}
                    className="min-h-touch rounded-lg border px-4 text-[15px] disabled:opacity-60"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    {t('vehicles.placeOnHold')}
                  </button>
                </div>
              ) : null}
              {error && (
                <p className="mt-3 text-[13px]" style={{ color: 'var(--status-not-ok)' }}>
                  {error}
                </p>
              )}
              {lastStamp ? <ActionStamp lines={[lastStamp]} /> : null}
              <div className="mt-6">
                <h3 className="text-[15px] font-medium">{t('vehicles.stationStepper')}</h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {stations
                    .slice()
                    .sort((a, b) => a.SequenceNo - b.SequenceNo)
                    .map((station) => {
                      const active = station.ID === vehicle.CurrentStationID;
                      const past =
                        currentStation != null &&
                        station.SequenceNo < currentStation.SequenceNo;
                      return (
                        <div
                          key={station.ID}
                          title={station.Name}
                          className="flex h-9 min-w-9 items-center justify-center rounded-full px-2 text-[13px] font-medium"
                          style={{
                            backgroundColor:
                              past || active ? 'var(--accent)' : 'transparent',
                            color: past || active ? 'var(--sidebar-text)' : 'var(--text-secondary)',
                            outline: active
                              ? '2px solid var(--accent)'
                              : '1px solid var(--border)',
                            outlineOffset: active ? '2px' : 0,
                            opacity: past ? 1 : active ? 1 : 0.5,
                          }}
                        >
                          {station.SequenceNo}
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
            <StationStepsPanel vin={vehicle.VIN} />
            <div
              className="rounded-xl border bg-[var(--bg-surface-1)] p-5"
              style={{ borderColor: 'var(--border)' }}
            >
              <MediaGallery entityType="VEHICLE" entityId={vehicle.VIN} listByVin={vehicle.VIN} />
            </div>
          </div>
        )}

        {activeTab === 'shipment' && has(Perm.ChecklistShipmentView) && (
          <ChecklistPanel
            vin={vehicle.VIN}
            type="shipment"
            title={t('vehicles.shipmentTitle')}
            hint={t('vehicles.shipmentHint')}
          />
        )}
        {activeTab === 'test' && has(Perm.ChecklistTestView) && (
          <ChecklistPanel
            vin={vehicle.VIN}
            type="test"
            title={t('vehicles.testTitle')}
            hint={t('vehicles.testHint')}
          />
        )}
        {activeTab === 'eol' && has(Perm.ChecklistEOLView) && (
          <EolWorkflowTab vin={vehicle.VIN} onVehicleChanged={() => void loadVehicle()} />
        )}
        {activeTab === 'issues' && has(Perm.IssueView) && <VehicleIssuesPanel vin={vehicle.VIN} />}
        {activeTab === 'audit' && (
          <VehicleStatusHistory items={statusHistory} error={historyError} />
        )}
      </div>
    </section>
  );
}

function ProgressRing({
  percentage,
  ariaLabel,
}: {
  percentage: number;
  ariaLabel: string;
}) {
  const r = 36;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.min(100, Math.max(0, percentage)) / 100);
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" aria-label={ariaLabel}>
      <circle
        cx="48"
        cy="48"
        r={r}
        fill="none"
        stroke="var(--border)"
        strokeWidth="8"
      />
      <circle
        cx="48"
        cy="48"
        r={r}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="8"
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 48 48)"
      />
      <text
        x="48"
        y="52"
        textAnchor="middle"
        className="fill-[var(--text-primary)] text-[18px] font-semibold"
      >
        {percentage.toFixed(0)}%
      </text>
    </svg>
  );
}
