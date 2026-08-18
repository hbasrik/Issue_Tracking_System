import { useCallback, useEffect, useState } from 'react';
import { api, type Issue } from '../lib/api';
import { StatusBadge } from './StatusBadge';
import { SeverityIndicator } from './SeverityIndicator';
import { useAuth } from '../auth/AuthProvider';

/**
 * Vehicle Detail → Issues tab: all issues for this VIN with severity,
 * status, description, reporter, and role-gated status actions.
 */
export function VehicleIssuesPanel({ vin }: { vin: string }) {
  const { isManager } = useAuth();
  const [items, setItems] = useState<Issue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api.listIssues(undefined, vin);
      setItems(res.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load issues');
      setItems([]);
    }
  }, [vin]);

  useEffect(() => {
    void load();
  }, [load]);

  async function transition(id: number, status: string) {
    setBusyId(id);
    setError(null);
    try {
      await api.updateIssueStatus(id, status);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'status update failed');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div
      className="rounded-xl border bg-[var(--bg-surface-1)] p-5"
      style={{ borderColor: 'var(--border)' }}
    >
      <h2 className="text-lg font-semibold">Vehicle issues</h2>
      <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
        All issues for this VIN — open and closed
      </p>

      {error && (
        <p className="mt-3 text-[13px]" style={{ color: 'var(--status-not-ok)' }}>
          {error}
        </p>
      )}

      {items.length === 0 && !error && (
        <p className="mt-4 text-[15px] text-[var(--text-secondary)]">No issues for this vehicle</p>
      )}

      <ul className="mt-4 space-y-3">
        {items.map((issue) => (
          <li
            key={issue.ID}
            className="rounded-lg border p-4"
            style={{ borderColor: 'var(--border)' }}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] text-[var(--text-secondary)]">#{issue.ID}</span>
              <SeverityIndicator severity={issue.Severity} />
              <StatusBadge kind="issue" value={issue.Status} />
            </div>
            <p className="mt-2 text-[15px]">{issue.Description}</p>
            <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
              Reporter: {issue.ReporterName || `user #${issue.IssueReporterID}`}
            </p>
            <IssueActions
              status={issue.Status}
              isManager={isManager}
              busy={busyId === issue.ID}
              onTransition={(status) => void transition(issue.ID, status)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Status transition buttons valid for current status + role. */
export function IssueActions({
  status,
  isManager,
  busy,
  onTransition,
}: {
  status: string;
  isManager: boolean;
  busy: boolean;
  onTransition: (status: string) => void;
}) {
  const actions: { status: string; label: string; primary?: boolean }[] = [];

  if (status === 'OPEN') {
    actions.push({ status: 'IN_PROGRESS', label: 'Mark In Progress', primary: true });
  }
  if (status === 'IN_PROGRESS') {
    actions.push({ status: 'DONE', label: 'Mark Done', primary: true });
  }
  if (status === 'DONE' && isManager) {
    actions.push({ status: 'APPROVED', label: 'Kalite Onay', primary: true });
    actions.push({ status: 'CONDITIONAL_APPROVED', label: 'Şartlı Onay' });
  }

  if (actions.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {actions.map((a) => (
        <button
          key={a.status}
          type="button"
          disabled={busy}
          onClick={() => onTransition(a.status)}
          className={
            a.primary
              ? 'min-h-touch rounded-lg bg-[var(--accent)] px-4 text-[13px] text-white disabled:opacity-60'
              : 'min-h-touch rounded-lg border px-4 text-[13px] disabled:opacity-60'
          }
          style={a.primary ? undefined : { borderColor: 'var(--border)' }}
        >
          {busy ? 'Updating…' : a.label}
        </button>
      ))}
    </div>
  );
}
