import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError, type Vehicle } from '../lib/api';
import { StatusBadge } from '../components/StatusBadge';

type Tab = 'overview' | 'eol' | 'shipment' | 'issues' | 'audit';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'eol', label: 'EoL' },
  { id: 'shipment', label: 'Shipment' },
  { id: 'issues', label: 'Issues' },
  { id: 'audit', label: 'Audit Log' },
];

const STATUS_OPTIONS = [
  'IN_PRODUCTION',
  'IN_WAREHOUSE',
  'WITH_CUSTOMER',
  'SHIPPED',
  'ON_HOLD',
] as const;

/** Vehicle detail with Overview / EoL / Shipment / Issues / Audit Log tabs — §2.1 / §4.3. */
export default function VehicleDetailPage() {
  const { vin = '' } = useParams();
  const [tab, setTab] = useState<Tab>('overview');
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusDraft, setStatusDraft] = useState('');
  const [blockingModal, setBlockingModal] = useState<number[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError(null);
      try {
        const v = await api.getVehicle(vin);
        if (cancelled) return;
        setVehicle(v);
        setStatusDraft(v.CurrentGlobalStatus);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load vehicle');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vin]);

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
    return <p className="text-[var(--text-secondary)]">Loading…</p>;
  }

  const pct = Number(vehicle.TotalProgressPercentage);

  return (
    <section>
      <Link to="/vehicles" className="text-[13px] text-[var(--accent)]">
        ← Vehicles
      </Link>
      <div className="mt-4 flex flex-wrap items-start gap-6">
        <ProgressRing percentage={pct} />
        <div>
          <h1 className="text-2xl font-semibold">…{vehicle.VIN.slice(-5)}</h1>
          <p className="text-[13px] text-[var(--text-secondary)]">{vehicle.VIN}</p>
          <div className="mt-2 flex items-center gap-2">
            <StatusBadge kind="vehicle" value={vehicle.CurrentGlobalStatus} />
            <span className="text-[13px] text-[var(--text-secondary)]">
              Phase {vehicle.CurrentPhase}/8 · Model #{vehicle.VehicleModelID}
            </span>
          </div>
        </div>
      </div>

      <div
        className="mt-6 flex gap-1 border-b"
        style={{ borderColor: 'var(--border)' }}
        role="tablist"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-[15px] ${
              tab === t.id
                ? 'border-b-2 border-[var(--accent)] font-medium text-[var(--accent)]'
                : 'text-[var(--text-secondary)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === 'overview' && (
          <div
            className="rounded-xl border bg-[var(--bg-surface-1)] p-5"
            style={{ borderColor: 'var(--border)' }}
          >
            <h2 className="text-lg font-semibold">Status editor</h2>
            <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
              Hard-block transitions return 409 with blocking item IDs (§4.3).
            </p>
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <select
                value={statusDraft}
                onChange={(e) => setStatusDraft(e.target.value)}
                className="rounded-lg border bg-[var(--bg-page)] px-3 py-2 text-[15px]"
                style={{ borderColor: 'var(--border)' }}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={busy}
                onClick={saveStatus}
                className="rounded-lg bg-[var(--accent)] px-4 py-2 text-[15px] text-white disabled:opacity-60"
              >
                Kaydet
              </button>
            </div>
            {error && (
              <p className="mt-3 text-[13px]" style={{ color: 'var(--status-not-ok)' }}>
                {error}
              </p>
            )}
            <div className="mt-6">
              <h3 className="text-[15px] font-medium">8-phase stepper</h3>
              <div className="mt-3 flex gap-2">
                {Array.from({ length: 8 }, (_, i) => i + 1).map((phase) => {
                  const done = phase < vehicle.CurrentPhase;
                  const active = phase === vehicle.CurrentPhase;
                  return (
                    <div
                      key={phase}
                      className="flex h-9 w-9 items-center justify-center rounded-full text-[13px] font-medium"
                      style={{
                        backgroundColor: done || active ? 'var(--accent)' : 'transparent',
                        color: done || active ? '#fff' : 'var(--text-secondary)',
                        outline: active ? '2px solid var(--accent)' : '1px solid var(--border)',
                        outlineOffset: active ? '2px' : 0,
                        opacity: done ? 1 : active ? 1 : 0.5,
                      }}
                    >
                      {phase}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {tab === 'eol' && (
          <PlaceholderPanel
            title="EoL checklist"
            body="Model-based EoL template items (13+) and exit-gate status will be listed here once dedicated read endpoints are available."
          />
        )}
        {tab === 'shipment' && (
          <PlaceholderPanel
            title="Shipment checklist"
            body="Model-based shipment template items (43+) and shipment-gate status will be listed here once dedicated read endpoints are available."
          />
        )}
        {tab === 'issues' && (
          <PlaceholderPanel
            title="Vehicle issues"
            body="Open and historical issues for this VIN. Use the Issues page for the global queue; quality approval (DONE → APPROVED) is Manager-only."
          />
        )}
        {tab === 'audit' && (
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
