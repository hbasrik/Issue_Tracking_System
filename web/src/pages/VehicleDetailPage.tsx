import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { StatusBadge } from '../components/StatusBadge';
import { VehicleIdentity } from '../components/VehicleIdentity';
import { ChecklistPanel } from '../components/ChecklistPanel';
import { EolWorkflowTab } from '../components/EolWorkflowTab';
import { MediaGallery } from '../components/MediaGallery';
import { VehicleIssuesPanel } from '../components/VehicleIssuesPanel';
import { ShipmentReadinessBanner } from '../components/ShipmentReadinessBanner';
import { api, ApiError, type ShipmentReadiness, type Station, type Vehicle } from '../lib/api';
import { useAuth } from '../auth/AuthProvider';
import { Perm } from '../auth/permissions';

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

const TABS: { id: Tab; label: string; perm?: string }[] = [
  { id: 'overview', label: 'Genel bakış' },
  { id: 'shipment', label: 'Sevkiyat', perm: Perm.ChecklistShipmentView },
  { id: 'test', label: 'Test', perm: Perm.ChecklistTestView },
  { id: 'eol', label: 'EoL', perm: Perm.ChecklistEOLView },
  { id: 'issues', label: 'Issues', perm: Perm.IssueView },
  { id: 'audit', label: 'Denetim kaydı' },
];

const STATUS_OPTIONS = [
  'IN_PRODUCTION',
  'IN_WAREHOUSE',
  'WITH_CUSTOMER',
  'SHIPPED',
  'ON_HOLD',
] as const;

/** Vehicle detail with Overview / EoL / Shipment / Test / Issues / Audit Log tabs. */
export default function VehicleDetailPage() {
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
  const [statusDraft, setStatusDraft] = useState('');
  const [blockingModal, setBlockingModal] = useState<number[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [readiness, setReadiness] = useState<ShipmentReadiness | null>(null);

  const loadVehicle = useCallback(async () => {
    const v = await api.getVehicle(vin);
    setVehicle(v);
    setStatusDraft(v.CurrentGlobalStatus);
    const ready = has(Perm.ChecklistShipmentView)
      ? await api.shipmentReadiness(vin).catch(() => null)
      : null;
    setReadiness(ready);
  }, [vin, has]);

  useEffect(() => {
    const fromUrl = searchParams.get('tab');
    setTab(isTab(fromUrl) ? fromUrl : 'overview');
  }, [vin, searchParams]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError(null);
      try {
        const [v, stationRes, ready] = await Promise.all([
          api.getVehicle(vin),
          api.listStations().catch(() => ({ items: [] as Station[] })),
          has(Perm.ChecklistShipmentView)
            ? api.shipmentReadiness(vin).catch(() => null)
            : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setVehicle(v);
        setStatusDraft(v.CurrentGlobalStatus);
        setStations(stationRes.items ?? []);
        setReadiness(ready);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Araç yüklenemedi');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vin, has]);

  async function saveStatus() {
    if (!vehicle) return;
    setBusy(true);
    setError(null);
    setBlockingModal(null);
    try {
      const updated = await api.updateVehicleStatus(vehicle.VIN, statusDraft);
      setVehicle(updated);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setBlockingModal(err.body.blocking_item_ids ?? []);
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : 'Status update failed');
      }
    } finally {
      setBusy(false);
    }
  }

  const visibleTabs = TABS.filter((t) => !t.perm || has(t.perm));
  const activeTab = visibleTabs.some((t) => t.id === tab) ? tab : 'overview';

  if (error && !vehicle) {
    return (
      <section>
        <Link to="/vehicles" className="text-[13px] text-[var(--accent)]">
          ← Vehicles
        </Link>
        <p className="mt-4" style={{ color: 'var(--status-not-ok)' }}>
          {error}
        </p>
      </section>
    );
  }

  if (!vehicle) {
    return <p className="text-[var(--text-secondary)]">Yükleniyor…</p>;
  }

  const pct = Number(vehicle.TotalProgressPercentage);
  const currentStation = stations.find((s) => s.ID === vehicle.CurrentStationID);

  return (
    <section>
      <Link to="/vehicles" className="text-[13px] text-[var(--accent)]">
        ← Vehicles
      </Link>
      <div className="mt-4 flex flex-wrap items-start gap-4 sm:gap-6">
        <ProgressRing percentage={pct} />
        <div className="min-w-0 flex-1">
          <VehicleIdentity vin={vehicle.VIN} />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge kind="vehicle" value={vehicle.CurrentGlobalStatus} />
            <span className="text-[13px] text-[var(--text-secondary)]">
              {currentStation
                ? `${currentStation.Name} · seq ${currentStation.SequenceNo}`
                : 'No current station'}
              {' · '}
              {vehicle.VehicleModelID != null
                ? `Model #${vehicle.VehicleModelID}`
                : 'No model'}
            </span>
          </div>
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
        {visibleTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={activeTab === t.id}
            onClick={() => setTab(t.id)}
            className={`min-h-touch shrink-0 whitespace-nowrap px-3 text-[15px] sm:px-4 ${
              activeTab === t.id
                ? 'border-b-2 border-[var(--accent)] font-medium text-[var(--accent)]'
                : 'text-[var(--text-secondary)]'
            }`}
          >
            {t.label}
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
              <h2 className="text-lg font-semibold">Status editor</h2>
              <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
                Hard-block transitions return 409 with blocking item IDs (§4.3).
              </p>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                <select
                  value={statusDraft}
                  onChange={(e) => setStatusDraft(e.target.value)}
                  disabled={
                    !has(Perm.AdminManageMasters) ||
                    vehicle.CurrentGlobalStatus === 'PLANNED'
                  }
                  className="min-h-touch w-full rounded-lg border bg-[var(--bg-page)] px-3 text-[15px] sm:w-auto disabled:opacity-60"
                  style={{ borderColor: 'var(--border)' }}
                >
                  {vehicle.CurrentGlobalStatus === 'PLANNED' && (
                    <option value="PLANNED">PLANNED</option>
                  )}
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={
                    busy ||
                    !has(Perm.AdminManageMasters) ||
                    vehicle.CurrentGlobalStatus === 'PLANNED'
                  }
                  onClick={saveStatus}
                  className="min-h-touch rounded-lg bg-[var(--accent)] px-4 text-[15px] text-white disabled:opacity-60"
                >
                  Kaydet
                </button>
              </div>
              {vehicle.CurrentGlobalStatus === 'PLANNED' && (
                <p className="mt-2 text-[13px] text-[var(--text-secondary)]">
                  PLANNED duruma elle geçilemez; hatta ilk istasyon adımı işlenince
                  otomatik IN_PRODUCTION olur.
                </p>
              )}
              {error && (
                <p className="mt-3 text-[13px]" style={{ color: 'var(--status-not-ok)' }}>
                  {error}
                </p>
              )}
              <div className="mt-6">
                <h3 className="text-[15px] font-medium">Station stepper</h3>
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
                            color: past || active ? '#fff' : 'var(--text-secondary)',
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
            title="Shipment checklist"
            hint="Yes/No checkbox — saves immediately. Incomplete items block WITH_CUSTOMER / SHIPPED."
          />
        )}
        {activeTab === 'test' && has(Perm.ChecklistTestView) && (
          <ChecklistPanel
            vin={vehicle.VIN}
            type="test"
            title="Test checklist"
            hint="Yes/No checkbox — saves immediately. Informational quality tracking, no vehicle-status gate."
          />
        )}
        {activeTab === 'eol' && has(Perm.ChecklistEOLView) && (
          <EolWorkflowTab vin={vehicle.VIN} onVehicleChanged={() => void loadVehicle()} />
        )}
        {activeTab === 'issues' && has(Perm.IssueView) && <VehicleIssuesPanel vin={vehicle.VIN} />}
        {activeTab === 'audit' && (
          <PlaceholderPanel
            title="Audit log"
            body="Status and checklist change history for this vehicle (audit_logs)."
          />
        )}
      </div>

      {blockingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            className="max-h-[80vh] w-full max-w-md overflow-auto rounded-xl border bg-[var(--bg-surface-1)] p-5"
            style={{ borderColor: 'var(--border)' }}
          >
            <h3 className="text-lg font-semibold" style={{ color: 'var(--status-not-ok)' }}>
              Gate blocked
            </h3>
            <p className="mt-2 text-[15px] text-[var(--text-secondary)]">
              The following checklist items block this transition:
            </p>
            <ul className="mt-3 list-inside list-disc text-[15px]">
              {blockingModal.map((id) => (
                <li key={id}>Item #{id}</li>
              ))}
            </ul>
            <button
              type="button"
              className="mt-4 rounded-lg border px-4 py-2 text-[15px]"
              style={{ borderColor: 'var(--border)' }}
              onClick={() => setBlockingModal(null)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function ProgressRing({ percentage }: { percentage: number }) {
  const r = 36;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.min(100, Math.max(0, percentage)) / 100);
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" aria-label={`${percentage}% complete`}>
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

function PlaceholderPanel({ title, body }: { title: string; body: string }) {
  return (
    <div
      className="rounded-xl border bg-[var(--bg-surface-1)] p-5"
      style={{ borderColor: 'var(--border)' }}
    >
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-2 text-[15px] text-[var(--text-secondary)]">{body}</p>
    </div>
  );
}
