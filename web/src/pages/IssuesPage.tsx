import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Issue, type Vehicle } from '../lib/api';
import { StatusBadge } from '../components/StatusBadge';
import { useAuth } from '../auth/AuthProvider';
import { MediaGallery } from '../components/MediaGallery';
import { VehicleIdentity } from '../components/VehicleIdentity';

/** Issues list + detail — quality approval and Şartlı Onay are Manager-only. */
export default function IssuesPage() {
  const { isManager } = useAuth();
  const [statusFilter, setStatusFilter] = useState('');
  const [items, setItems] = useState<Issue[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api.listIssues(statusFilter || undefined);
      setItems(res.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load issues');
      setItems([]);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = items.find((r) => r.ID === selectedId) ?? null;

  useEffect(() => {
    if (!selected) {
      setVehicle(null);
      return;
    }
    let cancelled = false;
    api
      .getVehicle(selected.VIN)
      .then((v) => {
        if (!cancelled) setVehicle(v);
      })
      .catch(() => {
        if (!cancelled) setVehicle(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  async function transition(status: 'APPROVED' | 'CONDITIONAL_APPROVED') {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await api.updateIssueStatus(selected.ID, status);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'status update failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h1 className="text-2xl font-semibold">Issues</h1>
      <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
        Issue list and detail — quality approval (DONE → APPROVED or Şartlı Onay)
        is Manager-only
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border bg-[var(--bg-surface-1)] px-3 py-2 text-[15px]"
          style={{ borderColor: 'var(--border)' }}
        >
          <option value="">All statuses</option>
          <option value="OPEN">OPEN</option>
          <option value="IN_PROGRESS">IN_PROGRESS</option>
          <option value="DONE">DONE</option>
          <option value="APPROVED">APPROVED</option>
          <option value="CONDITIONAL_APPROVED">CONDITIONAL_APPROVED</option>
        </select>
      </div>

      {error && (
        <p className="mt-3 text-[13px]" style={{ color: 'var(--status-not-ok)' }}>
          {error}
        </p>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div
          className="overflow-hidden rounded-xl border bg-[var(--bg-surface-1)]"
          style={{ borderColor: 'var(--border)' }}
        >
          <table className="w-full text-left text-[15px]">
            <thead>
              <tr
                className="border-b text-[13px] text-[var(--text-secondary)]"
                style={{ borderColor: 'var(--border)' }}
              >
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">VIN</th>
                <th className="px-4 py-3">Severity</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-[var(--text-secondary)]">
                    No issues
                  </td>
                </tr>
              )}
              {items.map((r) => (
                <tr
                  key={r.ID}
                  className="cursor-pointer border-t hover:bg-[var(--bg-surface-2)]"
                  style={{ borderColor: 'var(--border)' }}
                  onClick={() => setSelectedId(r.ID)}
                >
                  <td className="px-4 py-3">#{r.ID}</td>
                  <td className="px-4 py-3">
                    <Link
                      to={`/vehicles/${r.VIN}`}
                      className="text-[var(--accent)] hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      …{r.VIN.slice(-5)}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge kind="severity" value={r.Severity} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge kind="issue" value={r.Status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div
          className="rounded-xl border bg-[var(--bg-surface-1)] p-5"
          style={{ borderColor: 'var(--border)' }}
        >
          <h2 className="text-lg font-semibold">Issue detail</h2>
          {!selected && (
            <p className="mt-2 text-[15px] text-[var(--text-secondary)]">
              Select an issue from the list.
            </p>
          )}
          {selected && (
            <div className="mt-4 space-y-3 text-[15px]">
              <VehicleIdentity
                vin={selected.VIN}
                vehicleNumber={vehicle?.VehicleNumber}
                compact
              />
              <p>
                <span className="text-[var(--text-secondary)]">Station:</span>{' '}
                {selected.StationID ?? '—'}
              </p>
              <p>{selected.Description}</p>
              <div className="flex gap-2">
                <StatusBadge kind="severity" value={selected.Severity} />
                <StatusBadge kind="issue" value={selected.Status} />
              </div>
              {selected.Status === 'DONE' && isManager && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void transition('APPROVED')}
                    className="rounded-lg bg-[var(--accent)] px-4 py-2 text-white disabled:opacity-60"
                  >
                    Approve (quality sign-off)
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void transition('CONDITIONAL_APPROVED')}
                    className="rounded-lg border px-4 py-2 disabled:opacity-60"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    Şartlı Onay
                  </button>
                </div>
              )}
              <div className="pt-4">
                <MediaGallery entityType="ISSUE" entityId={String(selected.ID)} />
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
