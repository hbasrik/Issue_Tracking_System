// Source rule for the answer copy (docs/11 Karar 30) on screen and in print,
// read-only against the test API on :18081 / karea_eolnote_test with the
// 'tmp-snap' fixtures of api-trial.py setup (ids in /tmp/karea-snap/state.json).
// Never live.
//
// Web (Vite :5175) and mobile (react-native-web harness, real
// EOLChecklistScreen), TR and EN, 1280 and 375:
//   answered  NOT_OK, copy Rev. 03 / template Rev. 04
//             closed: icon (copy has a criterion); open: template lines
//   none      OK, stamped copy without values: closed, no icon
//   legacy    OK without a copy: closed, no icon, no criteria line
//   pending   open: template lines
//   print     (web, 1280) answered -> copy + revision, none / legacy -> no
//             line, pending -> template + revision
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from '../mobile-harness/build.mjs';
import { chromium } from '../../../web/node_modules/playwright/index.mjs';

const OUT = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:5175';
const API = 'http://localhost:18081/api/v1';
const VIN = 'N7V1K1SAXTK000008';
const { ids } = JSON.parse(fs.readFileSync('/tmp/karea-snap/state.json', 'utf8'));
const LABEL = {
  tr: { criterion: 'Kabul kriteri', method: 'Kontrol yöntemi', revision: 'Form revizyonu' },
  en: { criterion: 'Acceptance criterion', method: 'Control method', revision: 'Form revision' },
};

let failed = false;
const check = (label, ok, detail = '') => {
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed = true;
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const session = await (await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'manager@karea.local', password: 'changeme123' }),
})).json();
const auth = { Authorization: `Bearer ${session.token}` };
const items = (await (await fetch(`${API}/vehicles/${VIN}/checklist/eol`, { headers: auth })).json()).items;
const item = Object.fromEntries(Object.entries(ids).map(([k, id]) => [k, items.find((i) => i.ItemID === id)]));
const ANS = item.answered;
const PEN = item.pending;
const editLines = (L, it) => [[L.criterion, it.AcceptanceCriterion], [L.method, it.ControlMethod]];

const browser = await chromium.launch({ headless: true });

async function clipShot(page, locators, file) {
  await locators[0].evaluate((el) => el.scrollIntoView({ block: 'start' }));
  const boxes = [];
  for (const l of locators) boxes.push(await l.boundingBox());
  const vp = page.viewportSize();
  const y = Math.max(Math.min(...boxes.map((b) => b.y)) - 4, 0);
  const bottom = Math.min(Math.max(...boxes.map((b) => b.y + b.height)) + 4, vp.height);
  const x = Math.max(Math.min(...boxes.map((b) => b.x)) - 4, 0);
  const right = Math.min(Math.max(...boxes.map((b) => b.x + b.width)) + 4, vp.width);
  await page.screenshot({ path: path.join(OUT, file), clip: { x, y, width: right - x, height: bottom - y } });
}

// ---------------------------------------------------------------- web
console.log('== web ==');
async function webPage(locale, width) {
  const context = await browser.newContext({ viewport: { width, height: 1100 }, deviceScaleFactor: 1 });
  await context.addInitScript((data) => {
    localStorage.setItem('karea.auth.session', JSON.stringify(data.session));
    localStorage.setItem('karea-theme-mode', 'light');
    localStorage.setItem('karea-locale', data.locale);
  }, { session: { token: session.token, user: session.user, permissions: session.permissions }, locale });
  const page = await context.newPage();
  await page.goto(`${BASE}/vehicles/${VIN}?tab=eol`, { waitUntil: 'networkidle' });
  await page.locator(`li[data-checklist-active-item="${ids.pending}"]`).waitFor({ timeout: 15000 });
  return { page, context };
}
const card = (page, id) => page.locator(`li[data-checklist-active-item="${id}"]`);
const webCard = (page, id) => card(page, id).evaluate((li) => {
  const dl = li.querySelector('[data-checklist-criteria]');
  return {
    open: !li.hasAttribute('data-checklist-collapsed'),
    icon: Boolean(li.querySelector('[data-checklist-criteria-icon]')),
    lines: dl ? [...dl.querySelectorAll('[data-checklist-criteria-line]')].map((d) =>
      [d.querySelector('dt').textContent, d.querySelector('dd').textContent]) : [],
    text: li.innerText,
  };
});

for (const locale of ['tr', 'en']) {
  const L = LABEL[locale];
  for (const width of [1280, 375]) {
    const tag = `web ${locale} ${width}`;
    const { page, context } = await webPage(locale, width);
    const a = await webCard(page, ids.answered);
    const n = await webCard(page, ids.none);
    const g = await webCard(page, ids.legacy);
    const p = await webCard(page, ids.pending);
    check(`${tag} answered closed: icon (copy has a criterion), no text`, !a.open && a.icon && a.lines.length === 0);
    check(`${tag} none closed: no icon`, !n.open && !n.icon && n.lines.length === 0);
    check(`${tag} legacy closed: no icon, no criteria line`, !g.open && !g.icon && g.lines.length === 0
      && !g.text.includes(L.criterion) && !g.text.includes(L.method));
    check(`${tag} pending open: template lines`, p.open && same(p.lines, editLines(L, PEN)), JSON.stringify(p.lines));
    await clipShot(page, [card(page, ids.answered), card(page, ids.pending)], `web-${locale}-${width}-cards.png`);

    await card(page, ids.answered).locator('[data-checklist-item-header]').click();
    const ao = await webCard(page, ids.answered);
    check(`${tag} answered opened for edit: current template, not the copy`, ao.open && same(ao.lines, editLines(L, ANS))
      && !ao.text.includes(ANS.AnsweredCriteria.AcceptanceCriterion), JSON.stringify(ao.lines));
    await clipShot(page, [card(page, ids.answered)], `web-${locale}-${width}-answered-open.png`);
    await card(page, ids.answered).locator('[data-checklist-item-header]').click();

    if (width === 1280) {
      await page.evaluate(() => { document.body.dataset.print = 'checklist-eol'; });
      await page.emulateMedia({ media: 'print' });
      const blocks = await page.locator('.print-root[data-print-id="checklist-eol"] article').evaluateAll((arts) =>
        arts.map((art) => ({
          title: art.querySelector('.print-item-title').textContent.trim(),
          criteria: [...art.querySelectorAll('[data-print-criteria]')].map((p) => [p.getAttribute('data-print-criteria'), p.textContent]),
        })));
      const block = (it) => blocks.find((b) => b.title === `${it.ItemNo}. ${it.ItemText}`);
      const c = ANS.AnsweredCriteria;
      check(`${tag} print answered: the copy with its revision`, same(block(ANS)?.criteria, [
        ['criterion', `${L.criterion}: ${c.AcceptanceCriterion}`], ['method', `${L.method}: ${c.ControlMethod}`],
        ['revision', `${L.revision}: ${c.FormRevision}`]]), JSON.stringify(block(ANS)?.criteria));
      check(`${tag} print none: no criteria line`, same(block(item.none)?.criteria, []));
      check(`${tag} print legacy: no criteria line`, same(block(item.legacy)?.criteria, []), JSON.stringify(block(item.legacy)?.criteria));
      check(`${tag} print pending: the template with its revision`, same(block(PEN)?.criteria, [
        ['criterion', `${L.criterion}: ${PEN.AcceptanceCriterion}`], ['method', `${L.method}: ${PEN.ControlMethod}`],
        ['revision', `${L.revision}: ${PEN.FormRevision}`]]), JSON.stringify(block(PEN)?.criteria));
      await page.pdf({ path: path.join(OUT, `print-${locale}.pdf`), format: 'A4', printBackground: true });
      await page.setViewportSize({ width: 794, height: 1123 });
      const art = (it) => page.locator('.print-root[data-print-id="checklist-eol"] article', { hasText: `${it.ItemNo}. ${it.ItemText}` });
      await clipShot(page, [art(ANS), art(PEN)], `print-${locale}-tmp-items.png`);
      await page.emulateMedia({ media: 'screen' });
    }
    await context.close();
  }
}

// ---------------------------------------------------------------- mobile
console.log('== mobile (react-native-web harness, real EOLChecklistScreen) ==');
const bundle = await build(fs.mkdtempSync(path.join(os.tmpdir(), 'karea-snap-')));
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };
async function mobilePage(locale, width) {
  const page = await browser.newPage({ viewport: { width, height: 1100 }, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => console.log(`pageerror ${e}`));
  const posts = [];
  await page.route('http://karea-proxy/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (req.method() !== 'GET') posts.push(req.url());
    const url = req.url().replace('http://karea-proxy/api/v1', API);
    const res = await route.fetch({ url, headers: { ...req.headers(), ...auth } });
    return route.fulfill({ response: res, headers: { ...res.headers(), ...cors } });
  });
  await page.goto(`${pathToFileURL(path.join(bundle, 'index.html')).href}?scene=proxy-eol&vin=${VIN}&locale=${locale}&theme=light`);
  await page.locator(`[data-testid="eol-item-header-${ids.pending}"]`).waitFor({ timeout: 15000 });
  return { page, posts };
}
const mcard = (page, id) => page.locator(`[data-testid="eol-item-header-${id}"]`).locator('xpath=..');
const mobileCard = (page, id) => mcard(page, id).evaluate((el, itemId) => {
  const box = el.querySelector(`[data-testid="eol-criteria-${itemId}"]`);
  return {
    icon: Boolean(el.querySelector('[data-testid="eol-criteria-icon"]')),
    lines: box ? [...box.querySelectorAll('[data-testid^="eol-criteria-"]')]
      .filter((d) => /-(criterion|method|revision)-/.test(d.getAttribute('data-testid')))
      .map((d) => [d.children[0].textContent, d.children[1].textContent]) : [],
    text: el.innerText,
  };
}, id);

for (const locale of ['tr', 'en']) {
  const L = LABEL[locale];
  for (const width of [375, 1280]) {
    const tag = `mobile ${locale} ${width}`;
    const { page, posts } = await mobilePage(locale, width);
    const a = await mobileCard(page, ids.answered);
    const n = await mobileCard(page, ids.none);
    const g = await mobileCard(page, ids.legacy);
    const p = await mobileCard(page, ids.pending);
    check(`${tag} answered closed: icon, no text`, a.icon && a.lines.length === 0);
    check(`${tag} none closed: no icon`, !n.icon && n.lines.length === 0);
    check(`${tag} legacy closed: no icon, no criteria line`, !g.icon && g.lines.length === 0
      && !g.text.includes(L.criterion) && !g.text.includes(L.method));
    check(`${tag} pending open: template lines`, same(p.lines, editLines(L, PEN)), JSON.stringify(p.lines));
    await clipShot(page, [mcard(page, ids.answered), mcard(page, ids.pending)], `mobile-${locale}-${width}-cards.png`);
    await page.locator(`[data-testid="eol-item-header-${ids.answered}"]`).click();
    const ao = await mobileCard(page, ids.answered);
    check(`${tag} answered opened for edit: current template, not the copy`, same(ao.lines, editLines(L, ANS))
      && !ao.text.includes(ANS.AnsweredCriteria.AcceptanceCriterion), JSON.stringify(ao.lines));
    await clipShot(page, [mcard(page, ids.answered)], `mobile-${locale}-${width}-answered-open.png`);
    check(`${tag} read-only (no write request)`, posts.length === 0, String(posts.length));
    await page.close();
  }
}

await browser.close();
console.log(failed ? 'RESULT: FAIL' : 'RESULT: PASS');
process.exit(failed ? 1 : 0);
