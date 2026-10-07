// Karar 29 on mobile (docs/16 A52): the real EOLChecklistScreen (code
// untouched) on the react-native-web harness, its API calls routed to the
// test API on :18081 / karea_eolnote_test (never live). Run after
// run-api-trials.sh.
//
// Mobile shows only the items of the vehicle's current stage, so the only
// way it can reach a frozen item is a stale screen: the depot list is open
// when the vehicle is released elsewhere. TR and EN at 375 and 1280 open
// N7V1K1SA8TK000010 in the depot stage, the vehicle is then released
// through the API, and each screen edits an answered depot item to Not OK
// and saves. Expected: 409 from the API, the frozen-depot message on the
// item, and the progress row, the vehicle's audit log and media unchanged
// (md5). After a reload the released and the delivered vehicle show no
// editable items.
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from '../mobile-harness/build.mjs';
import { chromium } from '../../../web/node_modules/playwright/index.mjs';

const OUT = path.dirname(fileURLToPath(import.meta.url));
const API = 'http://localhost:18081/api/v1';
const DB = 'postgres://karea:karea_secret@localhost:5432/karea_eolnote_test?sslmode=disable';
const PSQL = '/opt/homebrew/opt/libpq/bin/psql';
const VIN = 'N7V1K1SA8TK000010';
const DELIVERED = 'N7V1K1SA2TK000018';
if (!/_test\?/.test(DB)) throw new Error('not a *_test database');
const q = (sql) => execFileSync(PSQL, [DB, '-X', '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql]).toString().trim();

const L = {
  tr: { notOk: 'Uygun değil', save: 'Kaydet', frozen: 'Araç depodan çıktı; depo aşaması EOL maddeleri değiştirilemez, fotoğraf eklenemez.' },
  en: { notOk: 'Not OK', save: 'Save', frozen: 'The vehicle has been released from the depot; depot-phase EOL items cannot change and no photos can be added.' },
};
let failed = false;
const check = (key, label, ok, detail = '') => {
  console.log(`${key} [${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed = true;
};

const session = await (await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'manager@karea.local', password: 'changeme123' }),
})).json();
const auth = { Authorization: `Bearer ${session.token}` };

// Fixture: answer the one depot item run-api-trials.sh left PENDING, so the
// vehicle is releasable while the screens are open.
const pendingItem = q(`select p.check_item_id from checklist_item_progress p join checklist_template_items ti on ti.id = p.check_item_id
  where p.vin = '${VIN}' and p.checklist_type = 'EOL' and ti.eol_phase = 'DEPOT' and p.check_status = 'PENDING' order by ti.item_no limit 1`);
if (pendingItem) {
  const r = await fetch(`${API}/vehicles/${VIN}/checklist/eol/${pendingItem}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...auth }, body: JSON.stringify({ status: 'OK' }),
  });
  console.log(`fixture: answer ${VIN} depot item ${pendingItem} OK: HTTP ${r.status}`);
}
const ITEM = Number(q(`select p.check_item_id from checklist_item_progress p join checklist_template_items ti on ti.id = p.check_item_id
  where p.vin = '${VIN}' and p.checklist_type = 'EOL' and ti.eol_phase = 'DEPOT' order by ti.item_no limit 1`));
const state = () => q(`select 'row=' || (select md5(p::text) from checklist_item_progress p where p.vin = '${VIN}' and p.checklist_type = 'EOL' and p.check_item_id = ${ITEM})
  || ' audit_rows=' || (select count(*) from audit_logs a where a.vin = '${VIN}')
  || ' audit_md5=' || coalesce((select md5(string_agg(a::text, '|' order by a.id)) from audit_logs a where a.vin = '${VIN}'), 'none')
  || ' media_rows=' || (select count(*) from media_attachments m where m.vin = '${VIN}')
  || ' depot_rows_md5=' || (select md5(string_agg(p::text, '|' order by p.id)) from checklist_item_progress p where p.vin = '${VIN}')`);

const bundle = await build(fs.mkdtempSync(path.join(os.tmpdir(), 'karea-eol-freeze-')));
const browser = await chromium.launch({ headless: true });
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };
const proxyLog = [];

async function openScreen(locale, width, vin) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => console.log(`pageerror ${e}`));
  await page.route('http://karea-proxy/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const url = req.url().replace('http://karea-proxy/api/v1', API);
    const res = await route.fetch({ url, headers: { ...req.headers(), ...auth } });
    proxyLog.push(`${locale}-${width} ${req.method()} ${url.replace(API, '')} -> ${res.status()}`);
    return route.fulfill({ response: res, headers: { ...res.headers(), ...cors } });
  });
  await page.goto(`${pathToFileURL(path.join(bundle, 'index.html')).href}?scene=proxy-eol&vin=${vin}&locale=${locale}&theme=light`);
  await page.waitForFunction(() => window.__calls?.some((c) => String(c.name).includes('/checklist/eol')), null, { timeout: 15000 });
  await page.waitForTimeout(1200);
  return page;
}

const screens = [];
for (const locale of ['tr', 'en']) {
  for (const width of [375, 1280]) {
    const key = `stale-${locale}-${width}`;
    const page = await openScreen(locale, width, VIN);
    const headers = await page.locator('[data-testid^="eol-item-header-"]').count();
    check(key, 'depot stage: depot items listed before release', headers === 5, `${headers} items`);
    check(key, `item ${ITEM} header is a toggle`, (await page.locator(`[data-testid="eol-item-header-${ITEM}"]`).getAttribute('aria-expanded')) === 'false');
    screens.push({ key, locale, width, page });
  }
}

const before = state();
const rel = await fetch(`${API}/vehicles/${VIN}/eol/depot-release`, { method: 'POST', headers: auth });
console.log(`\nrelease ${VIN} through the API while the screens are open: HTTP ${rel.status}`);
console.log(`before : ${before}`);
const afterRelease = state();

for (const { key, locale, width, page } of screens) {
  const t = L[locale];
  const logStart = proxyLog.length;
  await page.locator(`[data-testid="eol-item-header-${ITEM}"]`).click();
  await page.getByText(t.notOk, { exact: true }).first().click();
  await page.locator('textarea').first().fill('donmuş madde denemesi');
  await page.getByText(t.save, { exact: true }).last().click();
  const err = page.getByText(t.frozen, { exact: true });
  const shown = await err.waitFor({ timeout: 8000 }).then(() => true).catch(() => false);
  check(key, 'save shows the frozen-depot message on the item', shown, t.frozen);
  const posts = proxyLog.slice(logStart).filter((l) => l.includes(' POST '));
  check(key, 'API answered the save with 409', posts.length === 1 && posts[0].endsWith('-> 409'), posts.join('; '));
  if (shown) {
    await err.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(OUT, `mobile-${locale}-${width}-stale-save.png`) });
  }
}
const after = state();
console.log(`after release: ${afterRelease}`);
console.log(`after saves  : ${after}`);
check('db', 'four refused saves changed nothing (row, audit log, media, every progress row)', after === afterRelease);
for (const s of screens) await s.page.close();

for (const locale of ['tr', 'en']) {
  for (const [vin, label] of [[VIN, 'released'], [DELIVERED, 'delivered']]) {
    const key = `reload-${locale}-${label}`;
    const page = await openScreen(locale, 375, vin);
    const headers = await page.locator('[data-testid^="eol-item-header-"]').count();
    check(key, `${label} vehicle: no editable EoL items after reload`, headers === 0, `${headers} items`);
    await page.screenshot({ path: path.join(OUT, `mobile-${locale}-375-${label}-reload.png`) });
    await page.close();
  }
}
await browser.close();
console.log('\nproxy log:');
for (const l of proxyLog.filter((x) => !x.includes(' GET '))) console.log(`  ${l}`);
console.log(failed ? 'RESULT: FAIL' : 'RESULT: PASS');
process.exit(failed ? 1 : 0);
