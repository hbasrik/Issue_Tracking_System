import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  api,
  formatIssueCreatedAt,
  formatIssueListAt,
  mediaThumbUrl,
  type Issue,
} from '../lib/api';
import { isNonWebImage } from '../lib/mediaKind';
import { StatusBadge } from './StatusBadge';
import { SeverityIndicator } from './SeverityIndicator';
import { IssueActions } from './IssueActions';
import { MediaGallery } from './MediaGallery';
import { VehicleIdentity } from './VehicleIdentity';
import { DataCard, DataCardField } from './DataCard';
import { useIsDesktop, useIsWide } from '../lib/useMediaQuery';
import { IssueStatusHistory } from './IssueStatusHistory';
import { SectionHeading } from './SectionHeading';
import {
  issueDetailCopy,
  issueStationLabel,
} from '../lib/issueDetailCopy';

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
  if (isNonWebImage(null, null, path)) {
    return (
      <div
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md text-center text-[10px] font-semibold leading-tight text-[var(--text-secondary)]"
        style={{ backgroundColor: 'var(--bg-surface-2)' }}
        title="HEIC — tarayıcıda açılamaz"
      >
        HEIC
      </div>
    );
  }
  return (
    <img
      src={mediaThumbUrl(path)}
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
        <DataCardField label="Bildirim tarihi">
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
        <DataCardField label="Durum">
          <StatusBadge kind="issue" value={issue.Status} />
        </DataCardField>
        <DataCardField label="Bildiren">
          {issue.ReporterName || `kullanıcı #${issue.IssueReporterID}`}
        </DataCardField>
      </div>
    </div>
  );
}

/** Label / value block — stacked on narrow, 2-column grid from sm up. */
function IssueInfoFields({ issue }: { issue: Issue }) {
  const rows: [string, string][] = [
    [
      issueDetailCopy.reporter,
      issue.ReporterName || `kullanıcı #${issue.IssueReporterID}`,
    ],
    [issueDetailCopy.issueType, issue.IssueTypeName || '—'],
    [issueDetailCopy.station, issueStationLabel(issue)],
    [
      issueDetailCopy.reportedAt,
      formatIssueCreatedAt(issue.CreatedAt || issue.IssueDate),
    ],
  ];
  if (issue.SolutionDescription?.trim()) {
    rows.push([issueDetailCopy.solution, issue.SolutionDescription.trim()]);
  }
  return (
    <div className="flex flex-col gap-[var(--space-4)] sm:grid sm:grid-cols-[minmax(8.5rem,auto)_1fr] sm:gap-x-[var(--space-6)] sm:gap-y-[var(--space-3)]">
      {rows.map(([label, value]) => (
        <div key={label} className="flex flex-col gap-0.5 sm:contents">
          <p className="text-[13px] text-[var(--text-secondary)]">{label}</p>
          <p className="text-[15px] font-medium text-[var(--text-primary)]">
            {value}
          </p>
        </div>
      ))}
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function transition(status: string) {
    if (!issue) return;
    setBusy(true);
    setError(null);
    try {
      await api.updateIssueStatus(issue.ID, status);
      onStatusChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Durum güncellenemedi');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="rounded-xl border bg-[var(--bg-surface-1)] p-[var(--space-4)] sm:p-[var(--space-5)]"
      style={{ borderColor: 'var(--border)' }}
    >
      <h2 className="text-lg font-semibold">{issueDetailCopy.panelTitle}</h2>
      {!issue && (
        <p className="mt-[var(--space-2)] text-[15px] text-[var(--text-secondary)]">
          {issueDetailCopy.empty}
        </p>
      )}
      {error && (
        <p className="mt-[var(--space-3)] text-[13px]" style={{ color: 'var(--status-not-ok)' }}>
          {error}
        </p>
      )}
      {issue && (
        <div className="mt-[var(--space-4)] flex flex-col gap-[var(--space-5)] text-[15px]">
          <VehicleIdentity vin={issue.VIN} variant="hero" />

          <div className="flex flex-wrap items-center gap-[var(--space-2)]">
            <SeverityIndicator severity={issue.Severity} />
            <StatusBadge kind="issue" value={issue.Status} />
          </div>

          <p className="break-words text-[17px] font-medium leading-relaxed">
            {issue.Description}
          </p>

          <IssueInfoFields issue={issue} />

          <IssueActions
            status={issue.Status}
            busy={busy}
            onTransition={(status) => void transition(status)}
          />

          <div className="flex flex-col gap-[var(--space-3)]">
            <SectionHeading>{issueDetailCopy.history}</SectionHeading>
            <IssueStatusHistory issueId={issue.ID} hideTitle />
          </div>

          <div className="flex flex-col gap-[var(--space-4)]">
            <SectionHeading>{issueDetailCopy.photos}</SectionHeading>
            <MediaGallery
              entityType="ISSUE"
              entityId={String(issue.ID)}
              heading={issueDetailCopy.reportPhotos}
            />
            <MediaGallery
              entityType="ISSUE_RESOLUTION"
              entityId={String(issue.ID)}
              heading={issueDetailCopy.resolutionPhotos}
            />
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
  emptyLabel = 'Issue yok',
  hideVin = false,
  onStatusChanged,
}: {
  items: Issue[];
  emptyLabel?: string;
  hideVin?: boolean;
  onStatusChanged?: () => void;
}) {
  const isDesktop = useIsDesktop();
  const isWide = useIsWide();
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
    <div
      className={`grid gap-4 ${isWide ? 'grid-cols-[minmax(0,1fr)_minmax(22rem,26rem)]' : ''}`}
    >
      <div className="min-w-0">
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
          className="hidden overflow-x-auto rounded-xl border bg-[var(--bg-surface-1)] lg:block"
          style={{ borderColor: 'var(--border)' }}
        >
          <table className="w-full min-w-[42rem] text-left text-[15px]">
            <thead>
              <tr
                className="border-b text-[13px] text-[var(--text-secondary)]"
                style={{ borderColor: 'var(--border)' }}
              >
                <th className="whitespace-nowrap px-3 py-3">Fotoğraflar</th>
                <th className="whitespace-nowrap px-3 py-3">ID</th>
                <th className="whitespace-nowrap px-3 py-3">Bildirim tarihi</th>
                {!hideVin && (
                  <th className="whitespace-nowrap px-3 py-3">VIN</th>
                )}
                <th className="whitespace-nowrap px-3 py-3">Severity</th>
                <th className="whitespace-nowrap px-3 py-3">Durum</th>
                <th className="whitespace-nowrap px-3 py-3">Bildiren</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td
                    colSpan={hideVin ? 6 : 7}
                    className="px-3 py-6 text-[var(--text-secondary)]"
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
                  <td className="px-3 py-3">
                    <IssueThumb path={r.ReportPhotoPath} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">#{r.ID}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-[13px] tabular-nums text-[var(--text-secondary)]">
                    {formatIssueListAt(r.CreatedAt || r.IssueDate)}
                  </td>
                  {!hideVin && (
                    <td className="whitespace-nowrap px-3 py-3">
                      <Link
                        to={`/vehicles/${r.VIN}?tab=issues`}
                        className="text-[var(--accent)] hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        …{r.VIN.slice(-5)}
                      </Link>
                    </td>
                  )}
                  <td className="whitespace-nowrap px-3 py-3">
                    <SeverityIndicator severity={r.Severity} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    <StatusBadge kind="issue" value={r.Status} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-[13px] text-[var(--text-primary)]">
                    {r.ReporterName || `kullanıcı #${r.IssueReporterID}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isWide && (
        <div className="sticky top-4 min-w-0 self-start">{detail}</div>
      )}
      {isDesktop && !isWide && selected && (
        <div className="min-w-0">{detail}</div>
      )}
    </div>
  );
}
