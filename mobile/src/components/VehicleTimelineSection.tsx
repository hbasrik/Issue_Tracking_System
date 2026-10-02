import { useMemo, useState } from 'react';
import { LayoutAnimation, Pressable, Text, View } from 'react-native';
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  History,
  PauseCircle,
  RotateCcw,
  Truck,
  type LucideIcon,
} from 'lucide-react-native';
import { useTheme } from '../theme/ThemeProvider';
import { statusColors } from '../theme/tokens';
import { useI18n } from '../i18n';
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

function entryIcon(e: VehicleTimelineEntry): LucideIcon {
  if (e.DevReset) return RotateCcw;
  if (e.Action === 'place_on_hold' || e.Action === 'release_from_hold') return PauseCircle;
  switch (e.EventType) {
    case 'EOL_WORKFLOW_STAGE_CHANGE':
      return Truck;
    case 'CHECKLIST_ITEM_UPDATE':
      return ClipboardCheck;
    case 'ISSUE_STATUS_CHANGE':
    case 'ISSUE_CLASSIFICATION_CHANGE':
      return AlertCircle;
    default:
      return History;
  }
}

function Marker({ Icon, color }: { Icon: LucideIcon; color: string }) {
  return (
    <View
      style={{
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        marginTop: 1,
      }}
    >
      <View
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          backgroundColor: color,
          opacity: 0.14,
        }}
      />
      <Icon size={16} color={color} strokeWidth={2.25} />
    </View>
  );
}

function EntryRow({
  entry,
  toneColor,
  onIssuePress,
}: {
  entry: VehicleTimelineEntry;
  toneColor: (tone: TimelineTone) => string;
  onIssuePress?: (id: number) => void;
}) {
  const { tokens } = useTheme();
  const { t, locale } = useI18n();
  const line = describeTimelineEntry(entry, t, locale);
  const stamp = formatActionStamp(entry.ActorName, entry.EventAt, locale);
  const issueLink = line.category === 'issue' && entry.IssueID && onIssuePress;
  const title = (
    <Text
      style={{
        color: issueLink ? tokens.accent : tokens.textPrimary,
        fontSize: 15,
        fontWeight: '600',
      }}
    >
      {line.title}
    </Text>
  );
  return (
    <View style={{ flexDirection: 'row', gap: 10 }} testID={`timeline-row-${entry.EventType}`}>
      <Marker Icon={entryIcon(entry)} color={toneColor(line.tone)} />
      <View style={{ flex: 1, minWidth: 0 }}>
        {issueLink ? (
          <Pressable
            onPress={() => onIssuePress(entry.IssueID as number)}
            accessibilityRole="link"
            style={{ minHeight: 24 }}
          >
            {title}
          </Pressable>
        ) : (
          title
        )}
        {line.tag ? (
          <View
            style={{
              alignSelf: 'flex-start',
              marginTop: 4,
              paddingHorizontal: 8,
              paddingVertical: 2,
              borderRadius: 999,
              backgroundColor: `${statusColors.rework}1F`,
            }}
            testID="timeline-tag-dev-reset"
          >
            <Text style={{ color: statusColors.rework, fontSize: 12, fontWeight: '600' }}>
              {line.tag}
            </Text>
          </View>
        ) : null}
        {line.details.map((d) => (
          <Text key={d} style={{ color: tokens.textSecondary, fontSize: 13, marginTop: 2 }}>
            {d}
          </Text>
        ))}
        {stamp ? (
          <Text style={{ color: tokens.textSecondary, fontSize: 12, marginTop: 2 }}>{stamp}</Text>
        ) : null}
      </View>
    </View>
  );
}

function GroupRow({
  row,
  toneColor,
}: {
  row: Extract<TimelineRow, { kind: 'checklistGroup' }>;
  toneColor: (tone: TimelineTone) => string;
}) {
  const { tokens } = useTheme();
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const from = formatActionAt(row.entries[row.entries.length - 1].EventAt, locale);
  const to = formatActionAt(row.entries[0].EventAt, locale);
  const who = row.actorName.trim() || t('common.emDash');
  const when = from && to && from !== to ? `${from} – ${to}` : to ?? from ?? '';
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <View style={{ flexDirection: 'row', gap: 10 }} testID="timeline-row-CHECKLIST_GROUP">
      <Marker Icon={ClipboardCheck} color={toneColor('info')} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: tokens.textPrimary, fontSize: 15, fontWeight: '600' }}>
          {checklistGroupTitle(row, t)}
        </Text>
        <Text style={{ color: tokens.textSecondary, fontSize: 13, marginTop: 2 }}>
          {checklistGroupSummary(row, t)}
        </Text>
        <Text style={{ color: tokens.textSecondary, fontSize: 12, marginTop: 2 }}>
          {who} · {when}
        </Text>
        <Pressable
          onPress={() => {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setOpen((v) => !v);
          }}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4 }}
        >
          <Chevron size={16} color={tokens.accent} strokeWidth={2.25} />
          <Text style={{ color: tokens.accent, fontSize: 13, fontWeight: '600' }}>
            {open ? t('timeline.checklist.collapse') : t('timeline.checklist.expand')}
          </Text>
        </Pressable>
        {open ? (
          <View
            style={{ gap: 12, borderLeftWidth: 1, borderLeftColor: tokens.border, paddingLeft: 10 }}
          >
            {row.entries.map((e) => (
              <EntryRow key={e.ID} entry={e} toneColor={toneColor} />
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** Every audit event of one vehicle, newest first, with a kind filter. */
export function VehicleTimelineSection({
  items,
  truncated,
  failed,
  onIssuePress,
}: {
  items: VehicleTimelineEntry[] | null;
  truncated?: boolean;
  failed?: boolean;
  onIssuePress?: (id: number) => void;
}) {
  const { tokens } = useTheme();
  const { t } = useI18n();
  const [filter, setFilter] = useState<TimelineFilter>('all');
  const list = items ?? [];
  const counts = useMemo(() => timelineFilterCounts(list), [list]);
  const rows = useMemo(() => buildTimelineRows(list, filter), [list, filter]);
  const hasDevReset = list.some((e) => e.DevReset);
  const toneColor = (tone: TimelineTone): string => {
    switch (tone) {
      case 'info':
        return statusColors.info;
      case 'success':
        return statusColors.ok;
      case 'warning':
        return statusColors.conditionalOk;
      case 'danger':
        return statusColors.notOk;
      default:
        return tokens.textSecondary;
    }
  };

  return (
    <View style={{ marginBottom: 16 }} testID="vehicle-timeline">
      <Text style={{ color: tokens.textPrimary, fontSize: 17, fontWeight: '600', marginBottom: 4 }}>
        {t('timeline.title')}
      </Text>
      <Text style={{ color: tokens.textSecondary, fontSize: 13 }}>{t('timeline.hint')}</Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
        {TIMELINE_FILTERS.map((f) => {
          const selected = filter === f;
          return (
            <Pressable
              key={f}
              onPress={() => setFilter(f)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={{
                minHeight: 44,
                paddingHorizontal: 12,
                borderRadius: 999,
                borderWidth: 1,
                justifyContent: 'center',
                borderColor: selected ? tokens.accent : tokens.border,
              }}
            >
              <Text
                style={{
                  color: selected ? tokens.accent : tokens.textSecondary,
                  fontSize: 13,
                  fontWeight: '600',
                }}
              >
                {timelineFilterLabel(f, t)} · {counts[f]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {hasDevReset ? (
        <Text style={{ color: tokens.textSecondary, fontSize: 12, marginTop: 10 }}>
          {t('timeline.devResetNote')}
        </Text>
      ) : null}
      {failed ? (
        <Text style={{ color: statusColors.notOk, fontSize: 13, marginTop: 10 }}>
          {t('timeline.failed')}
        </Text>
      ) : null}
      {!failed && items !== null && rows.length === 0 ? (
        <Text style={{ color: tokens.textSecondary, fontSize: 13, marginTop: 10 }}>
          {list.length === 0 ? t('timeline.empty') : t('timeline.emptyFilter')}
        </Text>
      ) : null}
      {rows.length > 0 ? (
        <View style={{ gap: 16, marginTop: 14 }}>
          {rows.map((row) =>
            row.kind === 'entry' ? (
              <EntryRow
                key={row.key}
                entry={row.entry}
                toneColor={toneColor}
                onIssuePress={onIssuePress}
              />
            ) : (
              <GroupRow key={row.key} row={row} toneColor={toneColor} />
            ),
          )}
        </View>
      ) : null}
      {truncated ? (
        <Text style={{ color: tokens.textSecondary, fontSize: 12, marginTop: 14 }}>
          {t('timeline.truncated', { n: list.length })}
        </Text>
      ) : null}
    </View>
  );
}
