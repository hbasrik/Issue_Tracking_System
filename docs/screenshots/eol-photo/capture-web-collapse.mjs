// Web EoL answered-item badge (docs/16 A47), against the test API on
// karea_eolnote_test (never the live DB). Answers item 1 (OK + note + photo)
// through the API, then checks badge → edit → cancel → edit+save → badge.
import { chromium } from '../../../web/node_modules/playwright/index.mjs';
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const OUT = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:5175';
const API = 'http://localhost:18081/api/v1';
const VIN = 'N7V1K1SA0TK000003';
execFileSync('sips', ['-s', 'format', 'jpeg', path.join(OUT, 'mobile-collapse-tr-375-badge.png'),
  '--out', '/tmp/eol-collapse.jpg'], { stdio: 'ignore' });
const JPEG = readFileSync('/tmp/eol-collapse.jpg');

const session = await (
  await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'manager@karea.local', password: 'changeme123' }),
  })
).json();
const auth = { Authorization: `Bearer ${session.token}` };

let r = await fetch(`${API}/vehicles/${VIN}/checklist/eol/1`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...auth },
  body: JSON.stringify({ status: 'OK', note: 'Akü 12.6 V' }),
});
console.log(`answer item 1: HTTP ${r.status}`);
const list = await (await fetch(`${API}/vehicles/${VIN}/checklist/eol`, { headers: auth })).json();
const item1 = list.items.find((it) => it.ItemID === 1);
const form = new FormData();
form.append('entity_type', 'CHECKLIST_ITEM_PROGRESS');
form.append('entity_id', String(item1.ProgressID));
form.append('file', new Blob([JPEG], { type: 'image/jpeg' }), 'rozet-test.jpg');
r = await fetch(`${API}/media`, { method: 'POST', headers: auth, body: form });
console.log(`photo for progress ${item1.ProgressID}: HTTP ${r.status}`);

let failed = false;
const check = (label, ok, detail = '') => {
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed = true;
};

const browser = await chromium.launch({ headless: true });
for (const [width, locale] of [[1280, 'tr'], [375, 'tr'], [1280, 'en']]) {
  console.log(`== ${width}px ${locale} ==`);
  const L = locale === 'tr'
    ? { ok: 'Uygun', notOk: 'Uygun değil', save: 'Kaydet', cancel: 'İptal', note: 'Not: ' }
    : { ok: 'OK', notOk: 'Not OK', save: 'Save', cancel: 'Cancel', note: 'Note: ' };
  const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
  await context.addInitScript(
    ({ data, locale }) => {
      localStorage.setItem('karea.auth.session', JSON.stringify(data));
      localStorage.setItem('karea-theme-mode', 'light');
      localStorage.setItem('karea-locale', locale);
    },
    { data: { token: session.token, user: session.user, permissions: session.permissions }, locale },
  );
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/vehicles/${VIN}?tab=eol`, { waitUntil: 'networkidle' });
  const row = page.locator('[data-checklist-active-item="1"]');
  await row.waitFor({ timeout: 15000 });
  await page.waitForTimeout(600);

  check('item 1 is a badge', (await row.getAttribute('data-checklist-collapsed')) === '1');
  check('badge shows the answer', (await row.innerText()).includes(L.ok));
  const noteText = await row.locator('[data-checklist-note]').innerText();
  check('badge shows the note', noteText === `${L.note}Akü 12.6 V`, JSON.stringify(noteText));
  const photos = await row.locator('[data-checklist-photos] img').count();
  check('badge shows the photo', photos >= 1, `${photos} photo(s)`);
  check('badge has no status buttons or Save',
    (await row.locator('textarea').count()) === 0
      && (await row.getByRole('button', { name: L.save, exact: true }).count()) === 0);
  const pendingRow = page.locator('[data-checklist-active-item]:not([data-checklist-collapsed])').first();
  check('pending items stay open', (await pendingRow.locator('button', { hasText: L.save }).count()) === 1);

  await row.scrollIntoViewIfNeeded();
  let box = await row.boundingBox();
  await page.screenshot({
    path: path.join(OUT, `web-collapse-${locale}-${width}-badge.png`),
    clip: { x: 0, y: Math.max(0, box.y - 10), width, height: box.height + 20 },
  });

  await row.locator('button[aria-expanded="false"]').click();
  const editor = page.locator('[data-checklist-active-item="1"]');
  check('tap opens the editor', (await editor.locator('textarea').count()) === 1);
  const prefilled = await editor.locator('textarea').inputValue();
  check('editor prefilled with the saved note', prefilled === 'Akü 12.6 V', JSON.stringify(prefilled));
  await editor.scrollIntoViewIfNeeded();
  box = await editor.boundingBox();
  await page.screenshot({
    path: path.join(OUT, `web-collapse-${locale}-${width}-editing.png`),
    clip: { x: 0, y: Math.max(0, box.y - 10), width, height: box.height + 20 },
  });

  await editor.locator('textarea').fill('değişmemeli');
  await editor.getByRole('button', { name: L.cancel, exact: true }).click();
  check('Cancel closes it back to the badge',
    (await page.locator('[data-checklist-collapsed="1"]').count()) === 1);
  check('Cancel discards the draft',
    (await page.locator('[data-checklist-collapsed="1"] [data-checklist-note]').innerText()) === `${L.note}Akü 12.6 V`);

  if (width === 1280 && locale === 'tr') {
    await page.locator('[data-checklist-collapsed="1"] button[aria-expanded="false"]').click();
    const ed = page.locator('[data-checklist-active-item="1"]');
    await ed.getByRole('button', { name: L.notOk, exact: true }).click();
    await ed.locator('textarea').fill('conta yırtık');
    await ed.getByRole('button', { name: L.save, exact: true }).click();
    await page.locator('[data-checklist-collapsed="1"]').waitFor({ timeout: 10000 });
    const after = page.locator('[data-checklist-collapsed="1"]');
    const txt = await after.innerText();
    check('after Save the item is a badge with the new answer',
      txt.includes(L.notOk) && txt.includes('Not: conta yırtık'), JSON.stringify(txt.split('\n')));
    const saved = (await (await fetch(`${API}/vehicles/${VIN}/checklist/eol`, { headers: auth })).json())
      .items.find((it) => it.ItemID === 1);
    check('server has the edited answer', saved.Status === 'NOT_OK' && saved.Note === 'conta yırtık',
      `${saved.Status} / ${saved.Note}`);
    await after.scrollIntoViewIfNeeded();
    box = await after.boundingBox();
    await page.screenshot({
      path: path.join(OUT, 'web-collapse-tr-1280-after-save.png'),
      clip: { x: 0, y: Math.max(0, box.y - 10), width, height: box.height + 20 },
    });
    // Restore the fixture answer for the next viewports.
    await fetch(`${API}/vehicles/${VIN}/checklist/eol/1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ status: 'OK', note: 'Akü 12.6 V' }),
    });
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  check('no horizontal overflow', !overflow);
  check('no page errors', errors.length === 0, errors.join('; '));
  await context.close();
}
await browser.close();
console.log(failed ? 'WEB COLLAPSE CHECKS FAILED' : 'WEB COLLAPSE CHECKS PASSED');
process.exit(failed ? 1 : 0);
