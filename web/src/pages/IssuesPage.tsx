import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Issue, type Vehicle } from '../lib/api';
import { StatusBadge } from '../components/StatusBadge';
import { SeverityIndicator } from '../components/SeverityIndicator';
import { IssueActions } from '../components/VehicleIssuesPanel';
import { useAuth } from '../auth/AuthProvider';
import { MediaGallery } from '../components/MediaGallery';
import { VehicleIdentity } from '../components/VehicleIdentity';
import {
  DataCard,
  DataCardField,
  DesktopTableShell,
  MobileCardStack,
} from '../components/DataCard';

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

  async function transition(status: string) {
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
      <h1 className="text-xl font-semibold sm:text-2xl">Issues</h1>
      <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
        Global issue queue — quality approval (DONE → APPROVED or Şartlı Onay)
        is Manager-only
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="min-h-touch w-full rounded-lg border bg-[var(--bg-surface-1)] px-3 py-2 text-[15px] sm:w-auto"
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
        <div>
          <MobileCardStack
            empty={
              items.length === 0 ? (
                <p className="text-[15px] text-[var(--text-secondary)]">No issues</p>
              ) : null
            }
          >
            {items.map((r) => (
              <DataCard
                key={r.ID}
                selected={selectedId === r.ID}
                onClick={() => setSelectedId(r.ID)}
              >
                <DataCardField label="ID">#{r.ID}</DataCardField>
                <DataCardField label="VIN">
                  <Link
                    to={`/vehicles/${r.VIN}`}
                    className="text-[var(--accent)] hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    …{r.VIN.slice(-5)}
                  </Link>
                </DataCardField>
                <DataCardField label="Severity">
                  <SeverityIndicator severity={r.Severity} />
                </DataCardField>
                <DataCardField label="Status">
                  <StatusBadge kind="issue" value={r.Status} />
                </DataCardField>
              </DataCard>
            ))}
          </MobileCardStack>

          <DesktopTableShell>
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
                    style={{
                      borderColor: 'var(--border)',
                      backgroundColor:
                        selectedId === r.ID
                          ? 'var(--bg-surface-2)'
                          : undefined,
                    }}
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
                      <SeverityIndicator severity={r.Severity} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge kind="issue" value={r.Status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DesktopTableShell>
        </div>

        <div
          className="rounded-xl border bg-[var(--bg-surface-1)] p-4 sm:p-5"
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
              <p className="break-words">{selected.Description}</p>
              <p className="text-[13px] text-[var(--text-secondary)]">
                Reporter:{' '}
                {selected.ReporterName || `user #${selected.IssueReporterID}`}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <SeverityIndicator severity={selected.Severity} />
                <StatusBadge kind="issue" value={selected.Status} />
              </div>
              <IssueActions
                status={selected.Status}
                isManager={isManager}
                busy={busy}
                onTransition={(status) => void transition(status)}
              />
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
