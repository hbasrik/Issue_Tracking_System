import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  History,
  PauseCircle,
  RotateCcw,
  Truck,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { formatActionAt, formatActionStamp } from '../lib/actionStamp';
import {
  TIMELINE_FILTERS,
  buildTimelineRows,
  checklistGroupSummary,
  checklistGroupTitle,
  describeTimelineEntry,
  timelineFilterCounts,
  timelineFilterLabel,
  type TimelineFilter,
  type TimelineRow,
  type TimelineTone,
  type VehicleTimelineEntry,
} from '../../../shared/vehicleTimeline';

const TONE_COLOR: Record<TimelineTone, string> = {
  neutral: 'var(--text-secondary)',
  info: 'var(--status-info)',
  success: 'var(--status-ok)',
  warning: 'var(--status-conditional-ok)',
  danger: 'var(--status-not-ok)',
};

function entryIcon(e: VehicleTimelineEntry): ReactNode {
  const cls = 'h-4 w-4';
  if (e.DevReset) return <RotateCcw className={cls} aria-hidden />;
  if (e.Action === 'place_on_hold' || e.Action === 'release_from_hold') {
    return <PauseCircle className={cls} aria-hidden />;
  }
  switch (e.EventType) {
    case 'EOL_WORKFLOW_STAGE_CHANGE':
      return <Truck className={cls} aria-hidden />;
    case 'CHECKLIST_ITEM_UPDATE':
      return <ClipboardCheck className={cls} aria-hidden />;
    case 'ISSUE_STATUS_CHANGE':
    case 'ISSUE_CLASSIFICATION_CHANGE':
      return <AlertCircle className={cls} aria-hidden />;
    default:
      return <History className={cls} aria-hidden />;
  }
}

function Marker({ tone, children }: { tone: TimelineTone; children: ReactNode }) {
  const color = TONE_COLOR[tone];
  return (
    <span
      className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
      style={{ color, backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)` }}
    >
      {children}
    </span>
  );
}

function EntryRow({ entry, nested }: { entry: VehicleTimelineEntry; nested?: boolean }) {
  const { t, locale } = useI18n();
  const line = describeTimelineEntry(entry, t, locale);
  const stamp = formatActionStamp(entry.ActorName, entry.EventAt, locale);
  const title =
    entry.IssueID && line.category === 'issue' ? (
      <Link to={`/issues/${entry.IssueID}`} className="hover:underline">
        {line.title}
      </Link>
    ) : (
      line.title
    );
  return (
    <li className="flex gap-3" data-timeline-row={entry.EventType}>
      <Marker tone={line.tone}>{entryIcon(entry)}</Marker>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className={nested ? 'text-[14px]' : 'text-[15px] font-medium'}>{title}</p>
          {line.tag ? (
            <span
              className="rounded-full px-2 py-0.5 text-[12px] font-medium"
              style={{
                color: 'var(--status-rework)',
                backgroundColor: 'color-mix(in srgb, var(--status-rework) 12%, transparent)',
              }}
              data-timeline-tag="dev-reset"
            >
              {line.tag}
            </span>
          ) : null}
        </div>
        {line.details.map((d) => (
          <p key={d} className="text-[13px] text-[var(--text-secondary)]">
            {d}
          </p>
        ))}
        {stamp ? (
          <p className="mt-0.5 text-[12px] text-[var(--text-secondary)]">{stamp}</p>
        ) : null}
      </div>
    </li>
  );
}

function GroupRow({ row }: { row: Extract<TimelineRow, { kind: 'checklistGroup' }> }) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const from = formatActionAt(row.entries[row.entries.length - 1].EventAt, locale);
  const to = formatActionAt(row.entries[0].EventAt, locale);
  const who = row.actorName.trim() || t('common.emDash');
  const when = from && to && from !== to ? `${from} – ${to}` : to ?? from ?? '';
  return (
    <li className="flex gap-3" data-timeline-row="CHECKLIST_GROUP">
      <Marker tone="info">
        <ClipboardCheck className="h-4 w-4" aria-hidden />
      </Marker>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-medium">{checklistGroupTitle(row, t)}</p>
        <p className="text-[13px] text-[var(--text-secondary)]">{checklistGroupSummary(row, t)}</p>
        <p className="mt-0.5 text-[12px] text-[var(--text-secondary)]">
          {who} · {when}
        </p>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          data-testid="timeline-group-toggle"
          className="mt-1 inline-flex min-h-touch items-center gap-1 text-[13px] font-medium text-[var(--accent)]"
        >
          {open ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}
          {open ? t('timeline.checklist.collapse') : t('timeline.checklist.expand')}
        </button>
        {open ? (
          <ol className="mt-2 space-y-3 border-l pl-3" style={{ borderColor: 'var(--border)' }}>
            {row.entries.map((e) => (
              <EntryRow key={e.ID} entry={e} nested />
            ))}
          </ol>
        ) : null}
      </div>
    </li>
  );
}

/** Every audit event of one vehicle, newest first, with a kind filter. */
export function VehicleTimeline({ vin, refreshKey }: { vin: string; refreshKey?: string | number }) {
  const { t } = useI18n();
  const [items, setItems] = useState<VehicleTimelineEntry[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<TimelineFilter>('all');

  useEffect(() => {
    let cancelled = false;
    setError(false);
    api
      .getVehicleTimeline(vin)
      .then((res) => {
        if (cancelled) return;
        setItems(res.items ?? []);
        setTruncated(Boolean(res.truncated));
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [vin, refreshKey]);

  const list = items ?? [];
  const counts = useMemo(() => timelineFilterCounts(list), [list]);
  const rows = useMemo(() => buildTimelineRows(list, filter), [list, filter]);
  const hasDevReset = list.some((e) => e.DevReset);

  return (
    <div
      className="rounded-xl border bg-[var(--bg-surface-1)] p-5"
      style={{ borderColor: 'var(--border)' }}
      data-testid="vehicle-timeline"
    >
      <h2 className="text-lg font-semibold">{t('timeline.title')}</h2>
      <p className="mt-0.5 text-[13px] text-[var(--text-secondary)]">{t('timeline.hint')}</p>

      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={t('activity.filter.type')}>
        {TIMELINE_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            data-testid={`timeline-filter-${f}`}
            onClick={() => setFilter(f)}
            className="min-h-touch rounded-full border px-3 text-[13px] font-medium"
            style={
              filter === f
                ? { borderColor: 'var(--accent)', color: 'var(--accent)', backgroundColor: 'color-mix(in srgb, var(--accent) 10%, transparent)' }
                : { borderColor: 'var(--border)', color: 'var(--text-secondary)' }
            }
          >
            {timelineFilterLabel(f, t)} · {counts[f]}
          </button>
        ))}
      </div>

      {hasDevReset ? (
        <p className="mt-3 text-[12px] text-[var(--text-secondary)]">{t('timeline.devResetNote')}</p>
      ) : null}

      {error ? (
        <p className="mt-3 text-[13px]" style={{ color: 'var(--status-not-ok)' }}>
          {t('timeline.failed')}
        </p>
      ) : null}
      {!error && items !== null && rows.length === 0 ? (
        <p className="mt-3 text-[13px] text-[var(--text-secondary)]">
          {list.length === 0 ? t('timeline.empty') : t('timeline.emptyFilter')}
        </p>
      ) : null}
      {rows.length > 0 ? (
        <ol className="mt-4 space-y-4">
          {rows.map((row) =>
            row.kind === 'entry' ? (
              <EntryRow key={row.key} entry={row.entry} />
            ) : (
              <GroupRow key={row.key} row={row} />
            ),
          )}
        </ol>
      ) : null}
      {truncated ? (
        <p className="mt-4 text-[12px] text-[var(--text-secondary)]">
          {t('timeline.truncated', { n: list.length })}
        </p>
      ) : null}
    </div>
  );
}
