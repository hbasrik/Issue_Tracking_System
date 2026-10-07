// Web EoL photo input (docs/16 A51), against the test API on
// karea_eolnote_test (never the live DB). Uses the last branch item of a
// branch-stage vehicle, scrolled into view, so the page is long and the app
// scroll container is not at the top. Re-runnable: an item answered by an
// earlier run is opened from its header. Checks, on the open card (answered
// and pending):
//   - clicking "Dosya seç" does not move any scroll container
//   - the card is still inside the viewport after the click
//   - the input is in flow next to its label (not positioned elsewhere)
//   - Tab reaches the input, the button shows a focus ring, Space and Enter
//     open the file chooser, focusing it does not scroll
//   - choosing a file and Save keep the address unchanged
//   - after Save the photo exists on the server (API list + media row)
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from '../../../web/node_modules/playwright/index.mjs';

const OUT = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:5175';
const API = 'http://localhost:18081/api/v1';
const VIN = 'N7V1K1SA9TK000002';
const PSQL = '/opt/homebrew/opt/libpq/bin/psql';
const DB = 'postgres://karea:karea_secret@localhost:5432/karea_eolnote_test?sslmode=disable';
execFileSync('sips', ['-s', 'format', 'jpeg', path.join(OUT, 'mobile-collapse-tr-375-badge.png'),
  '--out', '/tmp/eol-file-input.jpg'], { stdio: 'ignore' });
const JPEG = readFileSync('/tmp/eol-file-input.jpg');

const session = await (
  await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'manager@karea.local', password: 'changeme123' }),
  })
).json();
const auth = { Authorization: `Bearer ${session.token}` };

let failed = false;
const check = (label, ok, detail = '') => {
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed = true;
};
// scrollTop of every element from the app scroll container up to <html>;
// overflow:hidden boxes count too, focus can scroll them.
const scrolls = (page) =>
  page.evaluate(() => {
    const out = {};
    let i = 0;
    for (let el = document.querySelector('[data-app-scroll]'); el; el = el.parentElement, i++) {
      const name = el.hasAttribute('data-app-scroll') ? 'app' : el === document.documentElement ? 'html' : `up${i}`;
      out[name] = Math.round(el.scrollTop);
    }
    return out;
  });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fmt = (s) => Object.entries(s).map(([k, v]) => `${k}=${v}`).join(' ');
const inViewport = (page, locator) =>
  locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < window.innerHeight;
  });

const browser = await chromium.launch({ headless: true });
const items = { 1280: [10, 9], 375: [8, 7] };
for (const [width, height] of [[1280, 720], [375, 667]]) {
  console.log(`== ${width}x${height} tr, ${VIN} (10 branch + 5 depot items) ==`);
  const [saveItem, keyItem] = items[width];
  const fileName = `scroll-${width}-${Date.now()}.jpg`;
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  await context.addInitScript(
    (data) => {
      localStorage.setItem('karea.auth.session', JSON.stringify(data));
      localStorage.setItem('karea-theme-mode', 'light');
      localStorage.setItem('karea-locale', 'tr');
    },
    { token: session.token, user: session.user, permissions: session.permissions },
  );
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/vehicles/${VIN}?tab=eol`, { waitUntil: 'networkidle' });
  const startUrl = page.url();

  // Mouse: click "Dosya seç" on an open card far down the list.
  const card = page.locator(`[data-checklist-active-item="${saveItem}"]`).first();
  await card.waitFor({ timeout: 15000 });
  if ((await card.getAttribute('data-checklist-collapsed')) !== null) {
    await card.locator('[data-checklist-item-header]').click();
  }
  check(`item ${saveItem} card is open`, (await card.getAttribute('data-checklist-collapsed')) === null);
  const chooser = card.getByText('Dosya seç', { exact: true });
  await chooser.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const input = card.locator('input[type="file"]');
  const placement = await input.evaluate((el) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const label = el.closest('label').getBoundingClientRect();
    return { position: s.position, top: Math.round(r.top), labelTop: Math.round(label.top), labelBottom: Math.round(label.bottom) };
  });
  check('file input is in flow (position static)', placement.position === 'static', `position=${placement.position}`);
  check('file input sits inside its label box',
    placement.top >= placement.labelTop && placement.top <= placement.labelBottom,
    `input top=${placement.top}, label ${placement.labelTop}..${placement.labelBottom}`);
  const before = await scrolls(page);
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), chooser.click()]);
  await page.waitForTimeout(400);
  const after = await scrolls(page);
  check('click on "Dosya seç" keeps every scrollTop', same(before, after), `before ${fmt(before)} | after ${fmt(after)}`);
  check('card still in the viewport after the click', await inViewport(page, card));
  check('click on "Dosya seç" keeps the address', page.url() === startUrl);

  await fc.setFiles({ name: fileName, mimeType: 'image/jpeg', buffer: JPEG });
  await page.waitForTimeout(300);
  check('choosing a file keeps the address', page.url() === startUrl);
  check('chosen file name shown on the card', (await card.innerText()).includes(fileName));
  check('choosing a file keeps every scrollTop', same(after, await scrolls(page)));

  await card.getByRole('button', { name: 'Uygun', exact: true }).click();
  const [upload] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/media') && r.request().method() === 'POST'),
    card.getByRole('button', { name: 'Kaydet' }).click(),
  ]);
  check('Save uploads the photo', upload.status() === 201, `POST /media ${upload.status()}`);
  await page.waitForTimeout(800);
  check('Save keeps the address', page.url() === startUrl);
  const list = await (await fetch(`${API}/vehicles/${VIN}/checklist/eol`, { headers: auth })).json();
  const saved = list.items.find((it) => it.ItemID === saveItem);
  const names = (saved.Photos ?? []).map((p) => p.file_name);
  check('server lists the photo on the item', names.includes(fileName), `Photos=${JSON.stringify(names)}`);
  const rows = execFileSync(PSQL, [DB, '-X', '-At', '-c',
    `SELECT count(*) FROM media_attachments WHERE entity_type = 'CHECKLIST_ITEM_PROGRESS' AND entity_id = '${saved.ProgressID}' AND file_name = '${fileName}'`]).toString().trim();
  check('media_attachments row exists for the progress row', rows === '1', `progress ${saved.ProgressID}: ${rows} row(s)`);
  check('card shows the photo after Save',
    (await page.locator(`[data-checklist-active-item="${saveItem}"] [data-checklist-photos]`).count()) === 1);

  // Keyboard: Tab from the last answer button lands on the file input.
  const kcard = page.locator(`[data-checklist-active-item="${keyItem}"]`).first();
  const kchooser = kcard.getByText('Dosya seç', { exact: true });
  await kchooser.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  check(`item ${keyItem} is pending and open by default`,
    (await kcard.getAttribute('data-checklist-collapsed')) === null && (await kcard.innerText()).includes('Bekliyor'));
  const pbefore = await scrolls(page);
  await Promise.all([page.waitForEvent('filechooser'), kchooser.click()]);
  await page.waitForTimeout(400);
  const pafter = await scrolls(page);
  check('pending card: click on "Dosya seç" keeps every scrollTop', same(pbefore, pafter),
    `before ${fmt(pbefore)} | after ${fmt(pafter)}`);
  check('pending card still in the viewport after the click', await inViewport(page, kcard));
  await kcard.getByRole('button', { name: 'Şartlı uygun', exact: true }).focus();
  const kbefore = await scrolls(page);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(300);
  const focused = await page.evaluate(() => document.activeElement?.getAttribute('type'));
  check('Tab reaches the file input', focused === 'file', `activeElement type=${focused}`);
  check('focusing the input by Tab keeps every scrollTop', same(kbefore, await scrolls(page)),
    `before ${fmt(kbefore)} | after ${fmt(await scrolls(page))}`);
  const ring = await kchooser.evaluate((el) => getComputedStyle(el).boxShadow);
  check('"Dosya seç" shows a focus ring while the input has keyboard focus',
    ring.split(/,(?![^(]*\))/).some((s) => /\b2px\b/.test(s) && !/rgba\(0, 0, 0, 0\)/.test(s)), ring);
  for (const key of ['Space', 'Enter']) {
    const opened = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 3000 }).then(() => true).catch(() => false),
      page.keyboard.press(key),
    ]);
    check(`${key} on the focused input opens the file chooser`, opened[0]);
  }
  check('keyboard steps keep every scrollTop', same(kbefore, await scrolls(page)));
  check('no page errors', errors.length === 0, errors.join(' | '));
  await page.screenshot({ path: path.join(OUT, `web-file-input-${width}-focus.png`) });
  await context.close();
}
await browser.close();
console.log(failed ? 'RESULT: FAIL' : 'RESULT: PASS');
process.exit(failed ? 1 : 0);
