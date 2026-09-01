import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  api,
  formatIssueCreatedAt,
  formatIssueListAt,
  mediaThumbUrl,
  type Issue,
} from '../lib/api';
import { useI18n } from '../i18n';
import { apiErrorMessage } from '../lib/apiErrors';
import { isNonWebImage } from '../lib/mediaKind';
import { StatusBadge } from './StatusBadge';
import { SeverityIndicator } from './SeverityIndicator';
import { IssueActions } from './IssueActions';
import { MediaGallery } from './MediaGallery';
import { VehicleIdentity } from './VehicleIdentity';
import { DataCard, DataCardField } from './DataCard';
import { IssueStatusHistory } from './IssueStatusHistory';
import { SectionHeading } from './SectionHeading';
import { issueStationLabel, reporterFallback } from '../lib/issueDetailCopy';

function IssueThumb({ path }: { path?: string }) {
  const { t } = useI18n();
  if (!path) {
    return (
      <div
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md text-[11px] text-[var(--text-secondary)]"
        style={{ backgroundColor: 'var(--bg-surface-2)' }}
        aria-hidden
      >
        {t('common.emDash')}
      </div>
    );
  }
  if (isNonWebImage(null, null, path)) {
    return (
      <div
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md text-center text-[10px] font-semibold leading-tight text-[var(--text-secondary)]"
        style={{ backgroundColor: 'var(--bg-surface-2)' }}
        title={t('issueDetail.heic')}
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
  const { t, locale } = useI18n();
  const localeTag = locale === 'en' ? 'en-GB' : 'tr-TR';
  return (
    <div className="flex gap-3">
      <IssueThumb path={issue.ReportPhotoPath} />
      <div className="min-w-0 flex-1 space-y-1">
        <DataCardField label={t('issue.id')}>#{issue.ID}</DataCardField>
        <DataCardField label={t('issueDetail.reportedAt')}>
          {formatIssueCreatedAt(issue.CreatedAt || issue.IssueDate, localeTag)}
        </DataCardField>
        {!hideVin && (
          <DataCardField label={t('issue.vin')}>
            <Link
              to={`/vehicles/${issue.VIN}?tab=issues`}
              className="text-[var(--accent)] hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              …{issue.VIN.slice(-5)}
            </Link>
          </DataCardField>
        )}
        <DataCardField label={t('severity.label')}>
          <SeverityIndicator severity={issue.Severity} />
        </DataCardField>
        <DataCardField label={t('issue.status')}>
          <StatusBadge kind="issue" value={issue.Status} />
        </DataCardField>
        <DataCardField label={t('issueDetail.reporter')}>
          {issue.ReporterName || reporterFallback(t, issue.IssueReporterID)}
        </DataCardField>
      </div>
    </div>
  );
}

/** Label / value block — stacked on narrow, 2-column grid from sm up. */
function IssueInfoFields({ issue }: { issue: Issue }) {
  const { t, locale } = useI18n();
  const localeTag = locale === 'en' ? 'en-GB' : 'tr-TR';
  const rows: [string, string][] = [
    [
      t('issueDetail.reporter'),
      issue.ReporterName || reporterFallback(t, issue.IssueReporterID),
    ],
    [t('issueDetail.issueType'), issue.IssueTypeName || t('common.emDash')],
    [t('issueDetail.station'), issueStationLabel(issue)],
    [
      t('issueDetail.reportedAt'),
      formatIssueCreatedAt(issue.CreatedAt || issue.IssueDate, localeTag),
    ],
  ];
  if (issue.SolutionDescription?.trim()) {
    rows.push([t('issueDetail.solution'), issue.SolutionDescription.trim()]);
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
  issue: Issue;
  onStatusChanged?: () => void;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function transition(status: string) {
    setBusy(true);
    setError(null);
    try {
      await api.updateIssueStatus(issue.ID, status);
      onStatusChanged?.();
    } catch (err) {
      setError(err instanceof Error ? apiErrorMessage(err, t) : t('issueDetail.statusFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="flex flex-col gap-[var(--space-4)] rounded-xl p-[var(--space-3)] sm:p-[var(--space-4)]"
      style={{
        backgroundColor: 'var(--bg-surface-2)',
        border: '1px solid var(--border)',
      }}
    >
      {error && (
        <p className="text-[13px]" style={{ color: 'var(--status-not-ok)' }}>
          {error}
        </p>
      )}
      <DetailBlock>
        <VehicleIdentity vin={issue.VIN} variant="hero" />
        <div className="mt-[var(--space-4)] flex flex-wrap items-center gap-[var(--space-2)]">
          <SeverityIndicator severity={issue.Severity} />
          <StatusBadge kind="issue" value={issue.Status} />
        </div>
        <p className="mt-[var(--space-5)] break-words text-[17px] font-medium leading-relaxed">
          {issue.Description}
        </p>
        <div className="mt-[var(--space-5)]">
          <IssueInfoFields issue={issue} />
        </div>
        <div className="mt-[var(--space-5)]">
          <IssueActions
            status={issue.Status}
            busy={busy}
            onTransition={(status) => void transition(status)}
          />
        </div>
      </DetailBlock>
      <DetailBlock heading={t('issueDetail.history')}>
        <IssueStatusHistory issueId={issue.ID} hideTitle />
      </DetailBlock>
      <DetailBlock heading={t('issueDetail.photos')}>
        <div className="flex flex-col gap-[var(--space-4)]">
          <MediaGallery
            entityType="ISSUE"
            entityId={String(issue.ID)}
            heading={t('issueDetail.reportPhotos')}
          />
          <MediaGallery
            entityType="ISSUE_RESOLUTION"
            entityId={String(issue.ID)}
            heading={t('issueDetail.resolutionPhotos')}
          />
        </div>
      </DetailBlock>
    </div>
  );
}

function DetailBlock({
  heading,
  children,
}: {
  heading?: string;
  children: ReactNode;
}) {
  return (
    <div
      className="rounded-xl border bg-[var(--bg-surface-1)] p-[var(--space-4)] sm:p-[var(--space-5)]"
      style={{ borderColor: 'var(--border)' }}
    >
      {heading ? (
        <div className="mb-[var(--space-3)]">
          <SectionHeading>{heading}</SectionHeading>
        </div>
      ) : null}
      {children}
    </div>
  );
}

/**
 * Clickable issue cards / table. Detail always expands under the clicked
 * row (accordion) — same pattern on every viewport.
 */
export function IssueList({
  items,
  emptyLabel,
  hideVin = false,
  onStatusChanged,
}: {
  items: Issue[];
  emptyLabel?: string;
  hideVin?: boolean;
  onStatusChanged?: () => void;
}) {
  const { t, locale } = useI18n();
  const localeTag = locale === 'en' ? 'en-GB' : 'tr-TR';
  const empty = emptyLabel ?? t('issueDetail.none');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    if (selectedId != null && !items.some((r) => r.ID === selectedId)) {
      setSelectedId(null);
    }
  }, [items, selectedId]);

  function toggle(id: number) {
    setSelectedId((cur) => (cur === id ? null : id));
  }

  const colCount = hideVin ? 6 : 7;

  return (
    <div className="min-w-0">
      <div className="space-y-3 lg:hidden">
        {items.length === 0 && (
          <p className="text-[15px] text-[var(--text-secondary)]">{empty}</p>
        )}
        {items.map((r) => (
          <div key={r.ID}>
            <DataCard selected={selectedId === r.ID} onClick={() => toggle(r.ID)}>
              <IssueCardSummary issue={r} hideVin={hideVin} />
            </DataCard>
            {selectedId === r.ID && (
              <div className="mt-2">
                <IssueDetailPanel issue={r} onStatusChanged={onStatusChanged} />
              </div>
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
              <th className="whitespace-nowrap px-3 py-3">{t('issue.photosCol')}</th>
              <th className="whitespace-nowrap px-3 py-3">{t('issue.id')}</th>
              <th className="whitespace-nowrap px-3 py-3">{t('issueDetail.reportedAt')}</th>
              {!hideVin && (
                <th className="whitespace-nowrap px-3 py-3">{t('issue.vin')}</th>
              )}
              <th className="whitespace-nowrap px-3 py-3">{t('severity.label')}</th>
              <th className="whitespace-nowrap px-3 py-3">{t('issue.status')}</th>
              <th className="whitespace-nowrap px-3 py-3">{t('issueDetail.reporter')}</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td
                  colSpan={colCount}
                  className="px-3 py-6 text-[var(--text-secondary)]"
                >
                  {empty}
                </td>
              </tr>
            )}
            {items.map((r) => {
              const open = selectedId === r.ID;
              return (
                <Fragment key={r.ID}>
                  <tr
                    className="cursor-pointer border-t hover:bg-[var(--bg-surface-2)]"
                    style={{
                      borderColor: 'var(--border)',
                      backgroundColor: open ? 'var(--bg-surface-2)' : undefined,
                      boxShadow: open
                        ? 'inset 3px 0 0 var(--accent)'
                        : undefined,
                    }}
                    onClick={() => toggle(r.ID)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggle(r.ID);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-expanded={open}
                  >
                    <td className="px-3 py-3">
                      <IssueThumb path={r.ReportPhotoPath} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">#{r.ID}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-[13px] tabular-nums text-[var(--text-secondary)]">
                      {formatIssueListAt(r.CreatedAt || r.IssueDate, localeTag)}
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
                      {r.ReporterName || reporterFallback(t, r.IssueReporterID)}
                    </td>
                  </tr>
                  {open && (
                    <tr>
                      <td
                        colSpan={colCount}
                        className="px-3 pb-3 pt-0"
                        style={{
                          backgroundColor: 'var(--bg-page)',
                          borderColor: 'var(--border)',
                        }}
                      >
                        <div
                          className="pt-3"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <IssueDetailPanel
                            issue={r}
                            onStatusChanged={onStatusChanged}
                          />
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
