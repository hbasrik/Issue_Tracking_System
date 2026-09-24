import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  issueCardColumnCount,
  ISSUE_CARD_COMPACT_MAX_PX,
} from '../../../shared/issueCardLayout';
import { useI18n } from '../i18n';
import {
  api,
  formatIssueCreatedAt,
  type Issue,
} from '../lib/api';
import { ApiErrorText } from './ApiErrorText';
import { StatusBadge } from './StatusBadge';
import { SeverityIndicator } from './SeverityIndicator';
import { IssueActions } from './IssueActions';
import { MediaGallery } from './MediaGallery';
import { VehicleIdentity } from './VehicleIdentity';
import { IssueStatusHistory } from './IssueStatusHistory';
import { SectionHeading } from './SectionHeading';
import {
  issueStationLabel,
  defectLabels,
  reporterFallback,
} from '../lib/issueDetailCopy';
import { IssueDetailPrint } from './print/IssuePrint';
import { useConfirm } from './ConfirmDialog';
import { useApprovalUndo } from './ApprovalUndoToast';
import {
  canEditIssueClassification,
  IssueClassificationEditor,
} from './IssueClassificationEditor';
import { useAuth } from '../auth/AuthProvider';
import { IssueCard } from './IssueCard';

const ESTIMATED_ROW_HEIGHT_PX = 280;
const ROW_GAP_PX = 12;
const ROW_OVERSCAN = 3;

/** Label / value block — stacked on narrow, 2-column grid from sm up. */
function IssueInfoFields({ issue }: { issue: Issue }) {
  const { t, locale } = useI18n();
  const localeTag = locale === 'en' ? 'en-GB' : 'tr-TR';
  const defect = defectLabels(issue, t, locale);
  const rows: [string, string, boolean?][] = [
    [
      t('issueDetail.reporter'),
      issue.ReporterName || reporterFallback(t, issue.IssueReporterID),
    ],
    [t('issueDetail.issueType'), issue.IssueTypeName || t('common.emDash')],
    [t('issueDetail.station'), issueStationLabel(issue)],
    [
      t('issueDetail.reportedAt'),
      formatIssueCreatedAt(issue.IssueDate || issue.CreatedAt, localeTag),
    ],
    [t('issue.defectZone'), defect.zone],
    [t('issue.defectPart'), defect.part],
    [t('issue.defectType'), defect.type],
    [t('issue.defectProcess'), defect.process],
    [t('issue.defectCode'), defect.code, true],
  ];
  if (issue.SolutionDescription?.trim()) {
    rows.push([t('issueDetail.solution'), issue.SolutionDescription.trim()]);
  }
  return (
    <div className="flex flex-col gap-[var(--space-4)] sm:grid sm:grid-cols-[minmax(8.5rem,auto)_1fr] sm:gap-x-[var(--space-6)] sm:gap-y-[var(--space-3)]">
      {rows.map(([label, value, muted]) => (
        <div key={label} className="flex flex-col gap-0.5 sm:contents">
          <p className="text-[13px] text-[var(--text-secondary)]">{label}</p>
          <p
            className={
              muted
                ? 'text-[13px] font-medium text-[var(--text-secondary)]'
                : 'text-[15px] font-medium text-[var(--text-primary)]'
            }
          >
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
  const { user, has } = useAuth();
  const confirm = useConfirm();
  const { showAfterApproval } = useApprovalUndo();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [editingClassification, setEditingClassification] = useState(false);
  const [showDoneForm, setShowDoneForm] = useState(false);
  const [solutionText, setSolutionText] = useState('');
  const canEditClassification = canEditIssueClassification(issue, user?.ID, has);

  useEffect(() => {
    setShowDoneForm(false);
    setSolutionText('');
    setEditingClassification(false);
    setError(null);
  }, [issue.ID, issue.Status]);

  useEffect(() => {
    const onUndone = (ev: Event) => {
      const detail = (ev as CustomEvent<{ issueId: number }>).detail;
      if (detail?.issueId === issue.ID) {
        onStatusChanged?.();
      }
    };
    window.addEventListener('karea:issue-approval-undone', onUndone);
    return () => window.removeEventListener('karea:issue-approval-undone', onUndone);
  }, [issue.ID, onStatusChanged]);

  async function transition(status: string) {
    if (status === 'DONE') {
      setShowDoneForm(true);
      setError(null);
      return;
    }

    if (status === 'APPROVED' || status === 'CONDITIONAL_APPROVED') {
      const vinTail = issue.VIN.slice(-5);
      const desc =
        issue.Description.length > 80
          ? `${issue.Description.slice(0, 77)}…`
          : issue.Description;
      const ok = await confirm({
        title:
          status === 'APPROVED'
            ? t('issueDetail.approveConfirmTitle')
            : t('issueDetail.conditionalConfirmTitle'),
        message:
          status === 'APPROVED'
            ? t('issueDetail.approveConfirmMessage', {
                description: desc,
                id: issue.ID,
                vinTail,
              })
            : t('issueDetail.conditionalConfirmMessage', {
                description: desc,
                id: issue.ID,
                vinTail,
              }),
        confirmLabel: t('common.confirm'),
        cancelLabel: t('common.cancel'),
        tone: status === 'CONDITIONAL_APPROVED' ? 'warning' : 'default',
      });
      if (!ok) return;
    }

    setBusy(true);
    setError(null);
    try {
      await api.updateIssueStatus(issue.ID, status);
      if (status === 'APPROVED' || status === 'CONDITIONAL_APPROVED') {
        showAfterApproval(issue.ID, status);
      }
      onStatusChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err : new Error(t('issueDetail.statusFailed')));
    } finally {
      setBusy(false);
    }
  }

  async function completeDone() {
    const desc = solutionText.trim();
    if (!desc) {
      setError(new Error(t('issueDetail.solutionDescRequired')));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.listMedia('ISSUE_RESOLUTION', String(issue.ID));
      if ((res.items ?? []).length === 0) {
        setError(new Error(t('issueDetail.solutionPhotoRequiredHint')));
        setBusy(false);
        return;
      }
      await api.updateIssueStatus(issue.ID, 'DONE', desc);
      setShowDoneForm(false);
      setSolutionText('');
      onStatusChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err : new Error(t('issueDetail.statusFailed')));
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
      <div className="flex justify-end">
        <IssueDetailPrint issue={issue} />
      </div>
      {error ? (
        <ApiErrorText
          error={error}
          className="text-[13px] text-[var(--status-not-ok)]"
        />
      ) : null}
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
          {editingClassification ? (
            <IssueClassificationEditor
              issue={issue}
              onCancel={() => setEditingClassification(false)}
              onSaved={() => {
                setEditingClassification(false);
                onStatusChanged?.();
              }}
            />
          ) : (
            <>
              <IssueInfoFields issue={issue} />
              {canEditClassification ? (
                <button
                  type="button"
                  className="mt-3 min-h-touch rounded-lg border px-3 text-[13px] font-medium hover:bg-[var(--bg-surface-1)]"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  onClick={() => setEditingClassification(true)}
                >
                  {t('issue.editClassification')}
                </button>
              ) : null}
            </>
          )}
        </div>
        <div className="mt-[var(--space-5)]">
          {showDoneForm && issue.Status === 'IN_PROGRESS' ? (
            <div
              className="space-y-3 rounded-lg border p-3"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-surface-1)' }}
            >
              <p className="text-[15px] font-semibold text-[var(--text-primary)]">
                {t('issueDetail.completionProof')}
              </p>
              <p className="text-[13px] text-[var(--text-secondary)]">
                {t('issueDetail.completionHint')}
              </p>
              <label className="block">
                <span className="text-[13px] text-[var(--text-secondary)]">
                  {t('issueDetail.solution')}
                </span>
                <textarea
                  value={solutionText}
                  onChange={(e) => setSolutionText(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-lg border bg-[var(--bg-page)] px-3 py-2 text-[15px] text-[var(--text-primary)]"
                  style={{ borderColor: 'var(--border)' }}
                  disabled={busy}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void completeDone()}
                  className="min-h-touch rounded-lg bg-[var(--accent)] px-4 text-[13px] text-white disabled:opacity-60"
                >
                  {busy ? t('common.updating') : t('status.issue.done')}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setShowDoneForm(false);
                    setSolutionText('');
                    setError(null);
                  }}
                  className="min-h-touch rounded-lg border px-4 text-[13px] disabled:opacity-60"
                  style={{ borderColor: 'var(--border)' }}
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          ) : (
            <IssueActions
              status={issue.Status}
              busy={busy}
              onTransition={(status) => void transition(status)}
            />
          )}
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
 * Adaptive issue card grid — compact list under 600px, multi-column grid above.
 * Virtualizes rows against AppShell `[data-app-scroll]` so off-screen cards
 * are placeholders. Detail opens at /issues/:id (not an accordion).
 */
export function IssueList({
  items,
  emptyLabel,
  hideVin = false,
  highlightedIds,
}: {
  items: Issue[];
  emptyLabel?: string;
  hideVin?: boolean;
  highlightedIds?: ReadonlySet<number>;
  /** @deprecated Detail is a route; kept for call-site compatibility. */
  onStatusChanged?: () => void;
}) {
  const { t } = useI18n();
  const empty = emptyLabel ?? t('issueDetail.none');
  const listRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : ISSUE_CARD_COMPACT_MAX_PX,
  );
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  useEffect(() => {
    const el = document.querySelector('[data-app-scroll]');
    setScrollEl(el instanceof HTMLElement ? el : null);
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (typeof w === 'number' && w > 0) setWidth(w);
    });
    ro.observe(el);
    setWidth(el.clientWidth || window.innerWidth);
    return () => ro.disconnect();
  }, []);

  const cols = issueCardColumnCount(width);

  const rows = useMemo(() => {
    const out: Issue[][] = [];
    for (let i = 0; i < items.length; i += cols) {
      out.push(items.slice(i, i + cols));
    }
    return out;
  }, [items, cols]);

  const measureScrollMargin = useCallback(() => {
    const list = listRef.current;
    const scroller = scrollEl;
    if (!list || !scroller) return;
    const listRect = list.getBoundingClientRect();
    const scrollRect = scroller.getBoundingClientRect();
    setScrollMargin(listRect.top - scrollRect.top + scroller.scrollTop);
  }, [scrollEl]);

  useLayoutEffect(() => {
    measureScrollMargin();
  }, [measureScrollMargin, rows.length, cols, width]);

  useEffect(() => {
    if (!scrollEl) return;
    const onResize = () => measureScrollMargin();
    window.addEventListener('resize', onResize);
    const ro = new ResizeObserver(onResize);
    ro.observe(scrollEl);
    if (listRef.current) ro.observe(listRef.current);
    return () => {
      window.removeEventListener('resize', onResize);
      ro.disconnect();
    };
  }, [scrollEl, measureScrollMargin]);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollEl,
    estimateSize: () => ESTIMATED_ROW_HEIGHT_PX,
    overscan: ROW_OVERSCAN,
    gap: ROW_GAP_PX,
    scrollMargin,
  });

  if (items.length === 0) {
    return (
      <div ref={listRef} className="min-w-0">
        <p className="text-[15px] text-[var(--text-secondary)]">{empty}</p>
      </div>
    );
  }

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();

  return (
    <div ref={listRef} className="min-w-0">
      <div
        className="relative w-full"
        style={{ height: totalSize }}
      >
        {virtualRows.map((virtualRow) => {
          const row = rows[virtualRow.index] ?? [];
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={rowVirtualizer.measureElement}
              className="absolute left-0 top-0 w-full"
              style={{
                transform: `translateY(${virtualRow.start - scrollMargin}px)`,
              }}
            >
              <div
                className="grid gap-3"
                style={{
                  gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                  alignItems: cols === 1 ? 'start' : 'stretch',
                }}
              >
                {row.map((issue) => (
                  <IssueCard
                    key={issue.ID}
                    issue={issue}
                    hideVin={hideVin}
                    layoutWidth={width}
                    highlighted={highlightedIds?.has(issue.ID) === true}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
