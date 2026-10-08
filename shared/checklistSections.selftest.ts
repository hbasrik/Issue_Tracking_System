/**
 * EoL sections in seed 03 must match EOL_CHECKLIST_SECTIONS (key and sort) and
 * resolve to a translated heading in TR and EN, never the raw key.
 * Run: node --experimental-strip-types shared/checklistSections.selftest.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  EOL_CHECKLIST_SECTIONS,
  groupItemsBySectionKey,
  sectionsForTemplateType,
} from './checklistSections.ts';
import { en, tr } from './i18n/messages.ts';

const seed = readFileSync(
  new URL('../database/seed/03_checklist_templates.sql', import.meta.url),
  'utf8',
);
const rowRe =
  /\('Default EoL Template \(Branch \+ Depot\)', (\d+)(?:::SMALLINT)?, '((?:[^']|'')*)', '(BRANCH|DEPOT)'(?:::eol_item_phase_enum)?, (?:'([a-z0-9_]+)'|NULL(?:::varchar)?), (\d+|NULL(?:::smallint)?)/g;
const rows = [...seed.matchAll(rowRe)].map((m) => ({
  itemNo: Number(m[1]),
  phase: m[3],
  key: m[4] ?? null,
  sort: m[5].startsWith('NULL') ? null : Number(m[5]),
}));
assert.equal(rows.length, 104, 'EOL seed rows');

const catalog = new Map(EOL_CHECKLIST_SECTIONS.map((e) => [e.key, e]));
for (const r of rows) {
  if (r.key === null) {
    assert.equal(r.sort, null, `item ${r.itemNo}: sort without key`);
    continue;
  }
  const entry = catalog.get(r.key);
  assert.ok(entry, `item ${r.itemNo}: ${r.key} missing from EOL_CHECKLIST_SECTIONS`);
  assert.equal(r.sort, entry.sort, `item ${r.itemNo}: sort`);
  assert.equal(entry.sort < 100 ? 'BRANCH' : 'DEPOT', r.phase, `item ${r.itemNo}: phase`);
}
assert.deepEqual(
  [...new Set(rows.flatMap((r) => (r.key ? [r.key] : [])))].sort(),
  [...catalog.keys()].sort(),
  'every catalog key is used by the seed',
);
assert.equal(sectionsForTemplateType('EOL'), EOL_CHECKLIST_SECTIONS);

for (const [name, dict] of [['tr', tr], ['en', en]] as const) {
  const t = ((k: string) => (dict as Record<string, string>)[k] ?? k) as never;
  const items = rows.map((r, i) => ({
    ItemID: i + 1,
    ItemNo: r.itemNo,
    SectionKey: r.key,
    SectionSort: r.sort,
  }));
  const groups = groupItemsBySectionKey(items, t);
  for (const g of groups) {
    assert.ok(!/^[a-z0-9_]+$/.test(g.title), `${name}: raw key shown as "${g.title}"`);
  }
  const exterior = groups.filter((g) => g.sectionKey?.startsWith('eol_exterior'));
  assert.equal(exterior.length, 2, `${name}: two exterior groups`);
  assert.equal(exterior[0].title, exterior[1].title, `${name}: same exterior title`);
  assert.deepEqual(
    groups.map((g) => g.sectionKey ?? null),
    [...EOL_CHECKLIST_SECTIONS.map((e) => e.key), null],
    `${name}: paper order, unsectioned last`,
  );
  console.log(`${name}: ${groups.map((g) => `${g.title} (${g.items.length})`).join(' | ')}`);
}
console.log('checklistSections.selftest ok');
