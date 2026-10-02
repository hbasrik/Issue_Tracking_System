/**
 * Vehicle timeline wording: every event kind reads as a sentence and no raw
 * stored value (IN_WAREHOUSE, eol_branch_ship, CONDITIONAL_OK) reaches the
 * screen in either language; checklist runs fold, filters split by kind.
 * Run: web/node_modules/.bin/esbuild shared/vehicleTimeline.selftest.ts \
 *   --bundle --platform=node --format=esm --outfile=/tmp/vt.mjs && node /tmp/vt.mjs
 */
import assert from 'node:assert/strict';
import { translate, type MessageKey } from './i18n';
import {
  buildTimelineRows,
  checklistGroupSummary,
  checklistGroupTitle,
  describeTimelineEntry,
  timelineFilterCounts,
  type VehicleTimelineEntry,
} from './vehicleTimeline';

let id = 100;
function entry(p: Partial<VehicleTimelineEntry>): VehicleTimelineEntry {
  id -= 1;
  return {
    ID: id,
    EventAt: '2026-10-02T09:00:00Z',
    EventType: 'STATUS_CHANGE',
    OldValue: '',
    NewValue: '',
    ActorName: 'Ali',
    ChecklistType: '',
    ItemText: '',
    Action: '',
    Trigger: '',
    HoldReason: '',
    DevReset: false,
    ...p,
  };
}

const all: VehicleTimelineEntry[] = [
  entry({ OldValue: 'IN_WAREHOUSE', NewValue: 'IN_PRODUCTION', DevReset: true, Action: 'dev_reset' }),
  entry({ EventType: 'EOL_WORKFLOW_STAGE_CHANGE', OldValue: 'DEPOT', NewValue: 'BRANCH', DevReset: true }),
  entry({ OldValue: 'IN_WAREHOUSE', NewValue: 'DELIVERED', Trigger: 'eol_deliver' }),
  entry({ EventType: 'EOL_WORKFLOW_STAGE_CHANGE', OldValue: 'DEPOT', NewValue: 'COMPLETED' }),
  entry({ OldValue: 'IN_PRODUCTION', NewValue: 'IN_WAREHOUSE', Trigger: 'eol_branch_ship' }),
  entry({ EventType: 'EOL_WORKFLOW_STAGE_CHANGE', OldValue: 'BRANCH', NewValue: 'DEPOT', OpenIssueCount: 2 }),
  entry({ OldValue: 'ON_HOLD', NewValue: 'IN_PRODUCTION', Action: 'release_from_hold' }),
  entry({ OldValue: 'IN_PRODUCTION', NewValue: 'ON_HOLD', Action: 'place_on_hold', HoldReason: 'Parça bekleniyor' }),
  entry({ OldValue: 'IN_PRODUCTION', NewValue: 'IN_WAREHOUSE' }),
  entry({ EventType: 'CHECKLIST_ITEM_UPDATE', ChecklistType: 'SHIPMENT', OldValue: 'PENDING', NewValue: 'OK', ItemNo: 3, ItemText: 'Ayna' }),
  entry({ EventType: 'CHECKLIST_ITEM_UPDATE', ChecklistType: 'SHIPMENT', OldValue: 'PENDING', NewValue: 'CONDITIONAL_OK', ItemNo: 2, ItemText: 'Paspas' }),
  entry({ EventType: 'CHECKLIST_ITEM_UPDATE', ChecklistType: 'SHIPMENT', OldValue: 'PENDING', NewValue: 'OK', ItemNo: 1, ItemText: 'Koltuk' }),
  entry({ EventType: 'CHECKLIST_ITEM_UPDATE', ChecklistType: 'TEST', OldValue: 'OK', NewValue: 'NOT_OK', ItemNo: 4 }),
  entry({ EventType: 'CHECKLIST_ITEM_UPDATE', ChecklistType: 'EOL', NewValue: 'REWORK' }),
  entry({ EventType: 'ISSUE_STATUS_CHANGE', OldValue: 'OPEN', NewValue: 'IN_PROGRESS', IssueID: 49 }),
  entry({ EventType: 'ISSUE_STATUS_CHANGE', OldValue: 'APPROVED', NewValue: 'DONE', IssueID: 49, Action: 'approval_undone' }),
  entry({ EventType: 'ISSUE_STATUS_CHANGE', OldValue: 'DONE', NewValue: 'CONDITIONAL_APPROVED', IssueID: 49 }),
  entry({
    EventType: 'ISSUE_CLASSIFICATION_CHANGE',
    IssueID: 49,
    Classification: [{ Field: 'part', FromTR: 'Kapı', FromEN: 'Door', ToTR: 'Ayna', ToEN: 'Mirror' }],
  }),
  entry({ EventType: 'ISSUE_CLASSIFICATION_CHANGE', IssueID: 50, Classification: [] }),
  entry({ OldValue: 'IN_PRODUCTION', NewValue: 'SOME_FUTURE_STATUS' }),
];

const RAW = /\b[A-Z]{2,}(?:_[A-Z0-9]+)+\b|\b[a-z]+_[a-z_]+\b|\{[a-z]+\}/;

for (const locale of ['tr', 'en'] as const) {
  const t = (key: MessageKey, vars?: Record<string, string | number>) => translate(locale, key, vars);
  for (const e of all) {
    const line = describeTimelineEntry(e, t, locale);
    for (const text of [line.title, ...line.details, line.tag ?? '']) {
      assert.ok(!RAW.test(text), `${locale} raw value in "${text}" (${e.EventType})`);
      assert.ok(!text.includes('timeline.'), `${locale} missing key in "${text}"`);
    }
  }
  const rows = buildTimelineRows(all, 'all');
  for (const row of rows) {
    if (row.kind !== 'checklistGroup') continue;
    for (const text of [checklistGroupTitle(row, t), checklistGroupSummary(row, t)]) {
      assert.ok(!RAW.test(text), `${locale} raw value in "${text}"`);
    }
  }
}

const tr = (key: MessageKey, vars?: Record<string, string | number>) => translate('tr', key, vars);
assert.equal(describeTimelineEntry(all[4], tr, 'tr').title, 'Araç depoya alındı');
assert.deepEqual(describeTimelineEntry(all[4], tr, 'tr').details, ['Durum: Hatta → Depoda']);
assert.equal(describeTimelineEntry(all[0], tr, 'tr').tag, 'Geliştirme sıfırlaması');
assert.equal(describeTimelineEntry(all[1], tr, 'tr').tag, 'Geliştirme sıfırlaması');
assert.equal(describeTimelineEntry(all[2], tr, 'tr').tag, null);
assert.deepEqual(describeTimelineEntry(all[7], tr, 'tr').details, [
  'Durum: Hatta → Beklemede',
  'Neden: Parça bekleniyor',
]);
assert.equal(describeTimelineEntry(all[5], tr, 'tr').title, 'Fabrikadan depoya sevk edildi');
assert.equal(describeTimelineEntry(all[9], tr, 'tr').title, 'Sevk maddesi 3: Bekliyor → Uygun');
assert.equal(describeTimelineEntry(all[14], tr, 'tr').title, 'Hata #49: Açık → İşlemde');
assert.equal(describeTimelineEntry(all[19], tr, 'tr').details[0], 'Durum: Hatta → Bilinmeyen değer');

// Three Shipment ticks by the same person fold; the single Test and EOL ticks stay.
const rows = buildTimelineRows(all, 'all');
const groups = rows.filter((r) => r.kind === 'checklistGroup');
assert.equal(groups.length, 1);
assert.equal(groups[0].kind === 'checklistGroup' && groups[0].entries.length, 3);
if (groups[0].kind === 'checklistGroup') {
  assert.equal(checklistGroupTitle(groups[0], tr), 'Sevk listesinde 3 madde işaretlendi');
  assert.equal(checklistGroupSummary(groups[0], tr), 'Uygun: 2 · Şartlı uygun: 1');
}
assert.equal(rows.length, all.length - 2);

const counts = timelineFilterCounts(all);
assert.deepEqual(counts, { all: 20, status: 10, checklist: 5, issue: 5 });
assert.equal(buildTimelineRows(all, 'issue').length, 5);
assert.ok(buildTimelineRows(all, 'status').every((r) => r.kind === 'entry'));

console.log(`shared/vehicleTimeline.ts ok (${all.length} entries × tr/en)`);
