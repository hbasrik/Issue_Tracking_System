import type { Translate } from './i18n';
import {
  classificationChangeLines,
  type ClassificationChange,
} from './classificationChanges';
import { issueStatusLabel } from './issueStatus';
import {
  checklistStatusLabel,
  eolStageLabel,
  vehicleStatusLabel,
} from './vehicleStatus';

/** One row of GET /vehicles/{vin}/timeline (newest first). */
export type VehicleTimelineEntry = {
  ID: number;
  EventAt: string;
  EventType: string;
  OldValue: string;
  NewValue: string;
  ActorName: string;
  ChecklistType: string;
  ItemNo?: number | null;
  ItemText: string;
  IssueID?: number | null;
  Classification?: ClassificationChange[] | null;
  Action: string;
  Trigger: string;
  HoldReason: string;
  DevReset: boolean;
  OpenIssueCount?: number | null;
};

export type VehicleTimelineResponse = {
  items: VehicleTimelineEntry[];
  truncated?: boolean;
};

export type TimelineCategory = 'status' | 'checklist' | 'issue';
export type TimelineFilter = 'all' | TimelineCategory;
export const TIMELINE_FILTERS: TimelineFilter[] = ['all', 'status', 'checklist', 'issue'];

export function timelineCategory(e: Pick<VehicleTimelineEntry, 'EventType'>): TimelineCategory {
  switch (e.EventType) {
    case 'CHECKLIST_ITEM_UPDATE':
      return 'checklist';
    case 'ISSUE_STATUS_CHANGE':
    case 'ISSUE_CLASSIFICATION_CHANGE':
      return 'issue';
    default:
      return 'status';
  }
}

export function timelineFilterLabel(f: TimelineFilter, t: Translate): string {
  switch (f) {
    case 'status':
      return t('timeline.filter.status');
    case 'checklist':
      return t('timeline.filter.checklist');
    case 'issue':
      return t('timeline.filter.issue');
    default:
      return t('timeline.filter.all');
  }
}

export type TimelineTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export type TimelineLine = {
  title: string;
  details: string[];
  /** Shown as a separate badge (development reset). */
  tag: string | null;
  tone: TimelineTone;
  category: TimelineCategory;
};

/** Raw enum-looking values never reach the screen. */
const RAW_VALUE = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/;

function named(value: string, label: (v: string) => string, t: Translate): string {
  if (!value) return t('common.emDash');
  const out = label(value);
  return out === value && RAW_VALUE.test(value) ? t('timeline.value.unknown') : out;
}

function change(
  ov: string,
  nv: string,
  label: (v: string) => string,
  t: Translate,
): string {
  if (ov && nv) return `${named(ov, label, t)} → ${named(nv, label, t)}`;
  return named(nv || ov, label, t);
}

export function checklistKindLabel(type: string, t: Translate): string {
  switch (type) {
    case 'EOL':
      return t('timeline.checklist.eol');
    case 'TEST':
      return t('timeline.checklist.test');
    case 'SHIPMENT':
      return t('timeline.checklist.shipment');
    default:
      return t('timeline.checklist.other');
  }
}

function issueRef(e: VehicleTimelineEntry, t: Translate): string {
  return e.IssueID ? t('timeline.issue.ref', { id: e.IssueID }) : t('timeline.issue.refUnknown');
}

function describeStatus(e: VehicleTimelineEntry, t: Translate): TimelineLine {
  const vs = (v: string) => vehicleStatusLabel(v, t);
  const statusLine = t('timeline.detail.status', { change: change(e.OldValue, e.NewValue, vs, t) });
  const base = { tag: null as string | null, category: 'status' as const };
  if (e.DevReset || e.Action === 'dev_reset') {
    return { ...base, title: t('timeline.status.devReset'), details: [statusLine], tag: t('timeline.tag.devReset'), tone: 'neutral' };
  }
  if (e.Action === 'place_on_hold') {
    const details = [statusLine];
    if (e.HoldReason.trim()) details.push(t('timeline.detail.holdReason', { reason: e.HoldReason.trim() }));
    return { ...base, title: t('timeline.status.hold'), details, tone: 'danger' };
  }
  if (e.Action === 'release_from_hold') {
    return { ...base, title: t('timeline.status.release'), details: [statusLine], tone: 'info' };
  }
  if (e.Trigger === 'eol_branch_ship') {
    return { ...base, title: t('timeline.status.toWarehouse'), details: [statusLine], tone: 'info' };
  }
  if (e.Trigger === 'eol_deliver') {
    return { ...base, title: t('timeline.status.delivered'), details: [statusLine], tone: 'success' };
  }
  return { ...base, title: t('timeline.status.changed'), details: [statusLine], tone: 'neutral' };
}

function describeStage(e: VehicleTimelineEntry, t: Translate): TimelineLine {
  const es = (v: string) => eolStageLabel(v, t);
  const stageLine = t('timeline.detail.stage', { change: change(e.OldValue, e.NewValue, es, t) });
  const base = { tag: null as string | null, category: 'status' as const };
  if (e.DevReset) {
    return { ...base, title: t('timeline.stage.devReset'), details: [stageLine], tag: t('timeline.tag.devReset'), tone: 'neutral' };
  }
  const from = e.OldValue;
  const to = e.NewValue;
  if (from === 'BRANCH' && to === 'DEPOT') {
    const details = [stageLine];
    if (e.OpenIssueCount && e.OpenIssueCount > 0) {
      details.push(t('timeline.detail.openIssuesAtShipment', { n: e.OpenIssueCount }));
    }
    return { ...base, title: t('timeline.stage.branchShip'), details, tone: 'info' };
  }
  if ((from === 'DEPOT' && (to === 'COMPLETED' || to === 'DOCUMENT'))) {
    return { ...base, title: t('timeline.stage.depotRelease'), details: [stageLine], tone: 'success' };
  }
  if (from === 'DOCUMENT' && to === 'COMPLETED') {
    return { ...base, title: t('timeline.stage.documentApproved'), details: [stageLine], tone: 'success' };
  }
  return { ...base, title: t('timeline.stage.changed'), details: [stageLine], tone: 'neutral' };
}

function checklistTone(status: string): TimelineTone {
  switch (status) {
    case 'OK':
      return 'success';
    case 'CONDITIONAL_OK':
      return 'warning';
    case 'NOT_OK':
    case 'REWORK':
      return 'danger';
    default:
      return 'neutral';
  }
}

function describeChecklist(e: VehicleTimelineEntry, t: Translate): TimelineLine {
  const kind = checklistKindLabel(e.ChecklistType, t);
  const status = change(e.OldValue, e.NewValue, (v) => checklistStatusLabel(v, t), t);
  const title =
    e.ItemNo != null && e.ItemNo > 0
      ? t('timeline.checklist.item', { kind, n: e.ItemNo, status })
      : t('timeline.checklist.itemNoNumber', { kind, status });
  return {
    title,
    details: e.ItemText ? [e.ItemText] : [],
    tag: null,
    tone: checklistTone(e.NewValue),
    category: 'checklist',
  };
}

function issueTone(status: string): TimelineTone {
  switch (status) {
    case 'APPROVED':
      return 'success';
    case 'CONDITIONAL_APPROVED':
    case 'DONE':
      return 'warning';
    case 'OPEN':
      return 'danger';
    default:
      return 'info';
  }
}

function describeIssue(e: VehicleTimelineEntry, t: Translate, locale: string): TimelineLine {
  const ref = issueRef(e, t);
  if (e.EventType === 'ISSUE_CLASSIFICATION_CHANGE') {
    return {
      title: t('timeline.issue.classification', { ref }),
      details: classificationChangeLines(e.Classification ?? [], t, locale),
      tag: null,
      tone: 'neutral',
      category: 'issue',
    };
  }
  if (
    e.Action === 'approval_undone' ||
    ((e.OldValue === 'APPROVED' || e.OldValue === 'CONDITIONAL_APPROVED') && e.NewValue === 'DONE')
  ) {
    return {
      title: t('timeline.issue.approvalUndone', { ref }),
      details: [t('timeline.detail.issueStatus', { change: change(e.OldValue, e.NewValue, (v) => issueStatusLabel(v, t), t) })],
      tag: null,
      tone: 'warning',
      category: 'issue',
    };
  }
  return {
    title: t('timeline.issue.status', {
      ref,
      change: change(e.OldValue, e.NewValue, (v) => issueStatusLabel(v, t), t),
    }),
    details: [],
    tag: null,
    tone: issueTone(e.NewValue),
    category: 'issue',
  };
}

/** Human sentence for one timeline row; no raw stored value is returned. */
export function describeTimelineEntry(
  e: VehicleTimelineEntry,
  t: Translate,
  locale: string,
): TimelineLine {
  switch (e.EventType) {
    case 'STATUS_CHANGE':
      return describeStatus(e, t);
    case 'EOL_WORKFLOW_STAGE_CHANGE':
      return describeStage(e, t);
    case 'CHECKLIST_ITEM_UPDATE':
      return describeChecklist(e, t);
    case 'ISSUE_STATUS_CHANGE':
    case 'ISSUE_CLASSIFICATION_CHANGE':
      return describeIssue(e, t, locale);
    default:
      return { title: t('timeline.other'), details: [], tag: null, tone: 'neutral', category: 'status' };
  }
}

export type TimelineRow =
  | { kind: 'entry'; key: string; entry: VehicleTimelineEntry }
  | {
      kind: 'checklistGroup';
      key: string;
      checklistType: string;
      actorName: string;
      entries: VehicleTimelineEntry[];
    };

/** Consecutive checklist ticks of the same list by the same person fold into one row. */
export const CHECKLIST_GROUP_MIN = 3;

export function buildTimelineRows(
  items: VehicleTimelineEntry[],
  filter: TimelineFilter,
): TimelineRow[] {
  const visible = filter === 'all' ? items : items.filter((e) => timelineCategory(e) === filter);
  const rows: TimelineRow[] = [];
  let run: VehicleTimelineEntry[] = [];
  const flush = () => {
    if (run.length >= CHECKLIST_GROUP_MIN) {
      rows.push({
        kind: 'checklistGroup',
        key: `g${run[0].ID}`,
        checklistType: run[0].ChecklistType,
        actorName: run[0].ActorName,
        entries: run,
      });
    } else {
      for (const e of run) rows.push({ kind: 'entry', key: `e${e.ID}`, entry: e });
    }
    run = [];
  };
  for (const e of visible) {
    if (e.EventType === 'CHECKLIST_ITEM_UPDATE') {
      const head = run[0];
      if (head && (head.ChecklistType !== e.ChecklistType || head.ActorName !== e.ActorName)) flush();
      run.push(e);
      continue;
    }
    flush();
    rows.push({ kind: 'entry', key: `e${e.ID}`, entry: e });
  }
  flush();
  return rows;
}

export function checklistGroupTitle(
  row: Extract<TimelineRow, { kind: 'checklistGroup' }>,
  t: Translate,
): string {
  return t('timeline.checklist.group', {
    kind: checklistKindLabel(row.checklistType, t),
    n: row.entries.length,
  });
}

/** "Uygun: 12 · Uygun değil: 1" summary of a folded checklist run. */
export function checklistGroupSummary(
  row: Extract<TimelineRow, { kind: 'checklistGroup' }>,
  t: Translate,
): string {
  const counts = new Map<string, number>();
  for (const e of row.entries) counts.set(e.NewValue, (counts.get(e.NewValue) ?? 0) + 1);
  return [...counts.entries()]
    .map(([status, n]) => `${named(status, (v) => checklistStatusLabel(v, t), t)}: ${n}`)
    .join(' · ');
}

export function timelineFilterCounts(items: VehicleTimelineEntry[]): Record<TimelineFilter, number> {
  const out: Record<TimelineFilter, number> = { all: items.length, status: 0, checklist: 0, issue: 0 };
  for (const e of items) out[timelineCategory(e)] += 1;
  return out;
}
