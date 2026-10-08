// Web EoL item cards (docs/16 A47, A49), against the test API on
// karea_eolnote_test (never the live DB). Answers item 1 (OK + note + photo)
// through the API, then checks the card layout: header row is the only
// toggle (mouse, Enter, Space), focus ring only on :focus-visible, hover tint
// only on the header, pending pill, photo opens its own lightbox, Cancel +
// Save side by side, edit + save closes the card again.
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from '../../../web/node_modules/playwright/index.mjs';

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
const answerItem1 = () => fetch(`${API}/vehicles/${VIN}/checklist/eol/1`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...auth },
  body: JSON.stringify({ status: 'OK', note: 'Akü 12.6 V' }),
});

let r = await answerItem1();
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
// True when a box-shadow list contains a non-transparent 2px ring.
const visibleRing = (shadow) =>
  shadow.split(/,(?![^(]*\))/).some((s) => /\b2px\b/.test(s) && !/rgba\(0, 0, 0, 0\)/.test(s));
const shot = async (page, locator, file, width) => {
  await locator.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  await page.evaluate(() => document.activeElement?.blur());
  await page.waitForTimeout(150);
  const box = await locator.boundingBox();
  await page.screenshot({
    path: path.join(OUT, file),
    clip: { x: 0, y: Math.max(0, box.y - 10), width, height: box.height + 20 },
  });
};

const browser = await chromium.launch({ headless: true });
for (const [width, locale] of [[1280, 'tr'], [375, 'tr'], [1280, 'en'], [375, 'en']]) {
  console.log(`== ${width}px ${locale} ==`);
  const L = locale === 'tr'
    ? { ok: 'Uygun', notOk: 'Uygun değil', pending: 'Bekliyor', save: 'Kaydet', cancel: 'İptal', note: 'Not: ', edit: 'Düzenle' }
    : { ok: 'OK', notOk: 'Not OK', pending: 'Pending', save: 'Save', cancel: 'Cancel', note: 'Note: ', edit: 'Edit' };
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
  const card = page.locator('[data-checklist-active-item="1"]');
  await card.waitFor({ timeout: 15000 });
  await page.waitForTimeout(600);
  const header = card.locator('[data-checklist-item-header]');

  // Closed card
  check('answered item 1 starts closed', (await card.getAttribute('data-checklist-collapsed')) === '1');
  const headerText = await header.innerText();
  check('header: number + name and answer pill', headerText.includes(item1.ItemText) && headerText.includes(L.ok), JSON.stringify(headerText.split('\n')));
  check('header: chevron icon', (await header.locator('svg').count()) === 1);
  check('header: aria-expanded=false', (await header.getAttribute('aria-expanded')) === 'false');
  const cardStyle = await card.evaluate((el) => ({ border: getComputedStyle(el).borderTopWidth, radius: getComputedStyle(el).borderTopLeftRadius }));
  check('card has its own frame', cardStyle.border === '1px' && parseFloat(cardStyle.radius) > 0, JSON.stringify(cardStyle));
  check('no "Edit" label on the card', !(await card.innerText()).split('\n').includes(L.edit));
  const noteText = await card.locator('[data-checklist-note]').innerText();
  check('closed body: note', noteText === `${L.note}Akü 12.6 V`, JSON.stringify(noteText));
  check('closed body: who/when', (await card.innerText()).includes('Local Manager'));
  check('closed body: photo', (await card.locator('[data-checklist-photos] img').count()) >= 1);
  check('closed body: no status buttons or Save',
    (await card.locator('textarea').count()) === 0
      && (await card.getByRole('button', { name: L.save, exact: true }).count()) === 0);
  const pending = page.locator('[data-checklist-active-item]:not([data-checklist-collapsed])').first();
  const pendingHeader = pending.locator('[data-checklist-item-header]');
  check('pending item: pill reads ' + L.pending, (await pendingHeader.innerText()).includes(L.pending), JSON.stringify((await pendingHeader.innerText()).split('\n')));
  check('pending item starts open', (await pendingHeader.getAttribute('aria-expanded')) === 'true');

  // Hover tint only on the header row
  await header.hover();
  await page.waitForTimeout(150);
  const hoverBg = await header.evaluate((el) => getComputedStyle(el).backgroundColor);
  const cardBg = await card.evaluate((el) => getComputedStyle(el).backgroundColor);
  const bodyBg = await card.locator('[data-checklist-note]').evaluate((el) => getComputedStyle(el.parentElement).backgroundColor);
  check('hover tints the header', hoverBg !== 'rgba(0, 0, 0, 0)' && hoverBg !== cardBg, `header=${hoverBg} card=${cardBg}`);
  check('hover does not tint the body', bodyBg === 'rgba(0, 0, 0, 0)', bodyBg);
  await page.mouse.move(0, 0);

  // Photo keeps its own click
  await card.locator('[data-checklist-photos] button').first().click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ timeout: 5000 }).catch(() => {});
  check('photo click opens the lightbox', (await dialog.count()) === 1);
  check('photo click does not toggle the card', (await header.getAttribute('aria-expanded')) === 'false');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  if (await dialog.count()) await dialog.getByRole('button').first().click();

  await shot(page, card, `web-collapse-${locale}-${width}-badge.png`, width);

  // Mouse click: opens, no focus ring (focus-visible only)
  await header.click();
  await page.waitForTimeout(300);
  check('header click opens the card', (await header.getAttribute('aria-expanded')) === 'true');
  const clickRing = await header.evaluate((el) => ({ focused: el.matches(':focus'), shadow: getComputedStyle(el).boxShadow }));
  check('no focus ring after a mouse click (focused, but not :focus-visible)',
    clickRing.focused && !visibleRing(clickRing.shadow), clickRing.shadow);
  const prefilled = await card.locator('textarea').inputValue();
  check('editor prefilled with the saved note', prefilled === 'Akü 12.6 V', JSON.stringify(prefilled));
  check('open card still shows the photos', (await card.locator('[data-checklist-photos] img').count()) >= 1);
  check('open card hides who/when', !(await card.innerText()).includes('Local Manager'));
  const cancelBox = await card.getByRole('button', { name: L.cancel, exact: true }).boundingBox();
  const saveBox = await card.getByRole('button', { name: L.save, exact: true }).boundingBox();
  const cardBox = await card.boundingBox();
  check('Cancel and Save side by side at bottom right',
    Math.abs(cancelBox.y - saveBox.y) < 2 && cancelBox.x < saveBox.x && cardBox.x + cardBox.width - (saveBox.x + saveBox.width) < 24,
    `cancel x=${Math.round(cancelBox.x)} save x=${Math.round(saveBox.x)}..${Math.round(saveBox.x + saveBox.width)} card right=${Math.round(cardBox.x + cardBox.width)}`);
  await shot(page, card, `web-collapse-${locale}-${width}-editing.png`, width);

  // Keyboard: focus-visible ring, Enter and Space toggle
  // From the header, Tab to the first answer button and Shift+Tab back
  // reaches the header by keyboard.
  await header.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await page.waitForTimeout(300);
  const viaKeyboard = await page.evaluate(() => document.activeElement?.hasAttribute('data-checklist-item-header'));
  const ring = await header.evaluate((el) => ({ fv: el.matches(':focus-visible'), shadow: getComputedStyle(el).boxShadow }));
  check('header reachable with the keyboard (Tab / Shift+Tab)', Boolean(viaKeyboard));
  check('focus ring visible on keyboard focus (:focus-visible)', ring.fv && visibleRing(ring.shadow), ring.shadow);
  await page.keyboard.press('Enter');
  check('Enter closes the card', (await header.getAttribute('aria-expanded')) === 'false');
  await page.keyboard.press(' ');
  check('Space opens the card', (await header.getAttribute('aria-expanded')) === 'true');
  if (width === 1280 && locale === 'tr') {
    await page.mouse.move(0, 0);
    const box = await card.boundingBox();
    await page.screenshot({
      path: path.join(OUT, 'web-collapse-tr-1280-focus.png'),
      clip: { x: 0, y: Math.max(0, box.y - 10), width, height: 80 },
    });
  }

  // Cancel discards the draft
  await card.locator('textarea').fill('değişmemeli');
  await card.getByRole('button', { name: L.cancel, exact: true }).click();
  check('Cancel closes the card', (await card.getAttribute('data-checklist-collapsed')) === '1');
  check('Cancel discards the draft', (await card.locator('[data-checklist-note]').innerText()) === `${L.note}Akü 12.6 V`);

  if (width === 1280 && locale === 'tr') {
    await header.click();
    await card.getByRole('button', { name: L.notOk, exact: true }).click();
    await card.locator('textarea').fill('conta yırtık');
    await card.getByRole('button', { name: L.save, exact: true }).click();
    await page.locator('[data-checklist-collapsed="1"]').waitFor({ timeout: 10000 });
    const txt = await card.innerText();
    check('after Save the card is closed with the new answer',
      txt.includes(L.notOk) && txt.includes('Not: conta yırtık'), JSON.stringify(txt.split('\n')));
    const saved = (await (await fetch(`${API}/vehicles/${VIN}/checklist/eol`, { headers: auth })).json())
      .items.find((it) => it.ItemID === 1);
    check('server has the edited answer', saved.Status === 'NOT_OK' && saved.Note === 'conta yırtık',
      `${saved.Status} / ${saved.Note}`);
    await shot(page, card, 'web-collapse-tr-1280-after-save.png', width);
    await answerItem1();
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  check('no horizontal overflow', !overflow);
  check('no page errors', errors.length === 0, errors.join('; '));
  await context.close();
}
await browser.close();
console.log(failed ? 'WEB COLLAPSE CHECKS FAILED' : 'WEB COLLAPSE CHECKS PASSED');
process.exit(failed ? 1 : 0);
