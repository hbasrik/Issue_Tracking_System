import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  api,
  formatIssueCreatedAt,
  mediaFileUrl,
  type Issue,
  type Vehicle,
} from '../lib/api';
import { StatusBadge } from './StatusBadge';
import { SeverityIndicator } from './SeverityIndicator';
import { IssueActions } from './IssueActions';
import { useAuth } from '../auth/AuthProvider';
import { MediaGallery } from './MediaGallery';
import { VehicleIdentity } from './VehicleIdentity';
import { DataCard, DataCardField } from './DataCard';
import { useIsDesktop } from '../lib/useMediaQuery';

function IssueThumb({ path }: { path?: string }) {
  if (!path) {
    return (
      <div
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md text-[11px] text-[var(--text-secondary)]"
        style={{ backgroundColor: 'var(--bg-surface-2)' }}
        aria-hidden
      >
        —
      </div>
    );
  }
  return (
    <img
      src={mediaFileUrl(path)}
      alt=""
      className="h-14 w-14 shrink-0 rounded-md object-cover"
      style={{ backgroundColor: 'var(--bg-surface-2)' }}
    />
  );
}

/** Summary fields shared by the stacked card and the desktop table row. */
function IssueCardSummary({
  issue,
  hideVin,
}: {
  issue: Issue;
  hideVin?: boolean;
}) {
  return (
    <div className="flex gap-3">
      <IssueThumb path={issue.ReportPhotoPath} />
      <div className="min-w-0 flex-1 space-y-1">
        <DataCardField label="ID">#{issue.ID}</DataCardField>
        <DataCardField label="Created">
          {formatIssueCreatedAt(issue.CreatedAt || issue.IssueDate)}
        </DataCardField>
        {!hideVin && (
          <DataCardField label="VIN">
            <Link
              to={`/vehicles/${issue.VIN}?tab=issues`}
              className="text-[var(--accent)] hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              …{issue.VIN.slice(-5)}
            </Link>
          </DataCardField>
        )}
        <DataCardField label="Severity">
          <SeverityIndicator severity={issue.Severity} />
        </DataCardField>
        <DataCardField label="Status">
          <StatusBadge kind="issue" value={issue.Status} />
        </DataCardField>
      </div>
    </div>
  );
}

export function IssueDetailPanel({
  issue,
  onStatusChanged,
}: {
  issue: Issue | null;
  onStatusChanged?: () => void;
}) {
  const { isManager } = useAuth();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!issue) {
      setVehicle(null);
      return;
    }
    let cancelled = false;
    api
      .getVehicle(issue.VIN)
      .then((v) => {
        if (!cancelled) setVehicle(v);
      })
      .catch(() => {
        if (!cancelled) setVehicle(null);
      });
    return () => {
      cancelled = true;
    };
  }, [issue]);

  async function transition(status: string) {
    if (!issue) return;
    setBusy(true);
    setError(null);
    try {
      await api.updateIssueStatus(issue.ID, status);
      onStatusChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'status update failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="rounded-xl border bg-[var(--bg-surface-1)] p-4 sm:p-5"
      style={{ borderColor: 'var(--border)' }}
    >
      <h2 className="text-lg font-semibold">Issue detail</h2>
      {!issue && (
        <p className="mt-2 text-[15px] text-[var(--text-secondary)]">
          Select an issue from the list.
        </p>
      )}
      {error && (
        <p className="mt-3 text-[13px]" style={{ color: 'var(--status-not-ok)' }}>
          {error}
        </p>
      )}
      {issue && (
        <div className="mt-4 space-y-3 text-[15px]">
          <VehicleIdentity
            vin={issue.VIN}
            vehicleNumber={vehicle?.VehicleNumber}
            compact
          />
          <p className="text-[13px] text-[var(--text-secondary)]">
            Created {formatIssueCreatedAt(issue.CreatedAt || issue.IssueDate)}
          </p>
          <p>
            <span className="text-[var(--text-secondary)]">Station:</span>{' '}
            {issue.StationID ?? '—'}
          </p>
          <p className="break-words">{issue.Description}</p>
          <p className="text-[13px] text-[var(--text-secondary)]">
            Reporter: {issue.ReporterName || `user #${issue.IssueReporterID}`}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <SeverityIndicator severity={issue.Severity} />
            <StatusBadge kind="issue" value={issue.Status} />
          </div>
          <IssueActions
            status={issue.Status}
            isManager={isManager}
            busy={busy}
            onTransition={(status) => void transition(status)}
          />
          <div className="pt-4">
            <MediaGallery entityType="ISSUE" entityId={String(issue.ID)} />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Clickable issue cards + detail. Desktop (≥1024px): list/table with a side
 * panel. Phone and tablet: accordion — detail expands under the clicked card.
 */
export function IssueList({
  items,
  emptyLabel = 'No issues',
  hideVin = false,
  onStatusChanged,
}: {
  items: Issue[];
  emptyLabel?: string;
  hideVin?: boolean;
  onStatusChanged?: () => void;
}) {
  const isDesktop = useIsDesktop();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = items.find((r) => r.ID === selectedId) ?? null;

  useEffect(() => {
    if (selectedId != null && !items.some((r) => r.ID === selectedId)) {
      setSelectedId(null);
    }
  }, [items, selectedId]);

  function toggle(id: number) {
    setSelectedId((cur) => (cur === id && !isDesktop ? null : id));
  }

  const detail = (
    <IssueDetailPanel issue={selected} onStatusChanged={onStatusChanged} />
  );

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div>
        <div className="space-y-3 lg:hidden">
          {items.length === 0 && (
            <p className="text-[15px] text-[var(--text-secondary)]">{emptyLabel}</p>
          )}
          {items.map((r) => (
            <div key={r.ID}>
              <DataCard selected={selectedId === r.ID} onClick={() => toggle(r.ID)}>
                <IssueCardSummary issue={r} hideVin={hideVin} />
              </DataCard>
              {selectedId === r.ID && !isDesktop && (
                <div className="mt-2">{detail}</div>
              )}
            </div>
          ))}
        </div>

        <div
          className="hidden overflow-hidden rounded-xl border bg-[var(--bg-surface-1)] lg:block"
          style={{ borderColor: 'var(--border)' }}
        >
          <table className="w-full text-left text-[15px]">
            <thead>
              <tr
                className="border-b text-[13px] text-[var(--text-secondary)]"
                style={{ borderColor: 'var(--border)' }}
              >
                <th className="px-4 py-3">Photo</th>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Created</th>
                {!hideVin && <th className="px-4 py-3">VIN</th>}
                <th className="px-4 py-3">Severity</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td
                    colSpan={hideVin ? 5 : 6}
                    className="px-4 py-6 text-[var(--text-secondary)]"
                  >
                    {emptyLabel}
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
                      selectedId === r.ID ? 'var(--bg-surface-2)' : undefined,
                  }}
                  onClick={() => toggle(r.ID)}
                >
                  <td className="px-4 py-3">
                    <IssueThumb path={r.ReportPhotoPath} />
                  </td>
                  <td className="px-4 py-3">#{r.ID}</td>
                  <td className="px-4 py-3 text-[13px] text-[var(--text-secondary)]">
                    {formatIssueCreatedAt(r.CreatedAt || r.IssueDate)}
                  </td>
                  {!hideVin && (
                    <td className="px-4 py-3">
                      <Link
                        to={`/vehicles/${r.VIN}?tab=issues`}
                        className="text-[var(--accent)] hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        …{r.VIN.slice(-5)}
                      </Link>
                    </td>
                  )}
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
        </div>
      </div>

      {isDesktop && <div className="sticky top-4 self-start">{detail}</div>}
    </div>
  );
}
