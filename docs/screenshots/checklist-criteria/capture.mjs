// Acceptance criterion and control method on the EoL card (docs/16 A55),
// read-only against the test API on :18081 / karea_eolnote_test (seeds
// 01-06 plus one marked 'tmp-criteria' long-text item on N7V1K1SA8TK000007,
// deleted afterwards). Never live.
//
// Web (Vite :5175) and mobile (react-native-web harness, real
// EOLChecklistScreen), TR and EN, 1280 and 375:
//   open   KY.FR-09 E009 (criterion + method), KY.FR-19 1 (method only),
//          kept "Batarya" (neither: no extra text)
//   closed E039 (icon) next to "Araç Motoru" (no icon)
//   long   tmp-criteria item: nothing wider than its card
//   frozen web only: branch cards of a depot vehicle (current behaviour)
//   print  web ChecklistPrint (PDF + PNG)
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from '../mobile-harness/build.mjs';
import { chromium } from '../../../web/node_modules/playwright/index.mjs';
import { scriptOutputDir } from '../lib/output-dir.mjs';

const OUT = scriptOutputDir(import.meta.url);
const BASE = 'http://localhost:5175';
const API = 'http://localhost:18081/api/v1';
const BRANCH_VIN = 'N7V1K1SAXTK000008'; // E001-E008 OK, Araç Motoru NOT_OK, rest pending
const KEPT_VIN = 'N7V1K1SA8TK000007'; // Batarya pending; carries the tmp long item
const DEPOT_VIN = 'N7V1K1SA1TK000012'; // depot pending, branch frozen
const LABEL = {
  tr: { criterion: 'Kabul kriteri', method: 'Kontrol yöntemi' },
  en: { criterion: 'Acceptance criterion', method: 'Control method' },
};

let failed = false;
const check = (label, ok, detail = '') => {
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed = true;
};

const session = await (await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'manager@karea.local', password: 'changeme123' }),
})).json();
const auth = { Authorization: `Bearer ${session.token}` };
async function items(vin) {
  const res = await (await fetch(`${API}/vehicles/${vin}/checklist/eol`, { headers: auth })).json();
  return res.items;
}
const byNo = (list, no) => list.find((i) => i.ItemNo === no);
const byText = (list, text) => list.find((i) => i.ItemText.startsWith(text));
const branchItems = await items(BRANCH_VIN);
const keptItems = await items(KEPT_VIN);
const depotItems = await items(DEPOT_VIN);
const E009 = byNo(branchItems, 9);
const E039 = byNo(branchItems, 39);
const MOTOR = byText(branchItems, 'Araç Motoru');
const BATTERY = byText(keptItems, 'Batarya');
const LONG = byText(keptItems, 'tmp-criteria');
const FR19_1 = byNo(depotItems, 47);

console.log('== API ==');
for (const [name, it, crit, meth] of [
  ['KY.FR-09 E009', E009, true, true], ['KY.FR-19 1', FR19_1, false, true],
  ['Batarya (kept)', BATTERY, false, false], ['Araç Motoru (kept)', MOTOR, false, false],
]) {
  check(`${name}: criterion ${crit ? 'set' : 'absent'}, method ${meth ? 'set' : 'absent'}`,
    Boolean(it.AcceptanceCriterion) === crit && Boolean(it.ControlMethod) === meth
      && (crit || !('AcceptanceCriterion' in it)) && (meth || !('ControlMethod' in it)),
    JSON.stringify({ AcceptanceCriterion: it.AcceptanceCriterion, ControlMethod: it.ControlMethod }));
}

function luminance(rgb) {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const parse = (css) => css.match(/[\d.]+/g).slice(0, 3).map(Number);
const ratio = (fg, bg) => {
  const [a, b] = [luminance(parse(fg)), luminance(parse(bg))].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
};

const browser = await chromium.launch({ headless: true });

// ---------------------------------------------------------------- web
console.log('== web ==');
async function webPage(locale, width, vin) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
  await context.addInitScript((data) => {
    localStorage.setItem('karea.auth.session', JSON.stringify(data.session));
    localStorage.setItem('karea-theme-mode', 'light');
    localStorage.setItem('karea-locale', data.locale);
  }, { session: { token: session.token, user: session.user, permissions: session.permissions }, locale });
  const page = await context.newPage();
  await page.goto(`${BASE}/vehicles/${vin}?tab=eol`, { waitUntil: 'networkidle' });
  await page.locator('li[data-checklist-active-item]').first().waitFor({ timeout: 15000 });
  return { page, context };
}
const card = (page, id) => page.locator(`li[data-checklist-active-item="${id}"]`);
async function webCard(page, id) {
  return card(page, id).evaluate((li) => {
    const dl = li.querySelector('[data-checklist-criteria]');
    const dd = dl?.querySelector('dd');
    const buttons = [...li.querySelectorAll('button')].find((b) => /^(OK|Uygun|Tamam)/i.test(b.textContent.trim()) || b.closest('.grid'));
    return {
      open: !li.hasAttribute('data-checklist-collapsed'),
      lines: dl ? [...dl.querySelectorAll('[data-checklist-criteria-line]')].map((d) => ({
        kind: d.getAttribute('data-checklist-criteria-line'),
        label: d.querySelector('dt').textContent,
        text: d.querySelector('dd').textContent,
      })) : [],
      icon: Boolean(li.querySelector('[data-checklist-criteria-icon]')),
      extraBeforeButtons: dl && buttons ? Boolean(dl.compareDocumentPosition(buttons) & Node.DOCUMENT_POSITION_FOLLOWING) : null,
      fg: dd ? getComputedStyle(dd).color : null,
      bg: dl ? getComputedStyle(dl).backgroundColor : null,
      ddSize: dd ? getComputedStyle(dd).fontSize : null,
      titleSize: getComputedStyle(li).fontSize,
      overflow: li.scrollWidth - li.clientWidth,
      dlOverflow: dl ? dl.scrollWidth - dl.clientWidth : 0,
      text: li.innerText,
    };
  });
}
async function shot(page, locators, file) {
  const boxes = [];
  for (const l of locators) {
    await l.scrollIntoViewIfNeeded();
    boxes.push(await l.boundingBox());
  }
  await locators[0].evaluate((el) => el.scrollIntoView({ block: 'start' }));
  const fresh = [];
  for (const l of locators) fresh.push(await l.boundingBox());
  const x = Math.min(...fresh.map((b) => b.x)) - 4;
  const y = Math.max(Math.min(...fresh.map((b) => b.y)) - 4, 0);
  const right = Math.max(...fresh.map((b) => b.x + b.width)) + 4;
  const bottom = Math.max(...fresh.map((b) => b.y + b.height)) + 4;
  const vp = page.viewportSize();
  await page.screenshot({
    path: path.join(OUT, file),
    clip: { x: Math.max(x, 0), y, width: Math.min(right, vp.width) - Math.max(x, 0), height: Math.min(bottom, vp.height) - y },
  });
}

for (const locale of ['tr', 'en']) {
  const L = LABEL[locale];
  for (const width of [1280, 375]) {
    const tag = `web ${locale} ${width}`;
    // open: criterion + method, and the closed pair on the same vehicle
    {
      const { page, context } = await webPage(locale, width, BRANCH_VIN);
      const a = await webCard(page, E009.ItemID);
      check(`${tag} E009 open shows both lines`, a.open && JSON.stringify(a.lines.map((l) => [l.label, l.text]))
        === JSON.stringify([[L.criterion, E009.AcceptanceCriterion], [L.method, E009.ControlMethod]]),
      a.lines.map((l) => `${l.label}: ${l.text}`).join(' / '));
      check(`${tag} E009 lines above the answer buttons`, a.extraBeforeButtons === true);
      const c = ratio(a.fg, a.bg);
      check(`${tag} E009 smaller than item text, contrast >= 4.5`, parseFloat(a.ddSize) < parseFloat(a.titleSize) && c >= 4.5,
        `${a.ddSize} vs ${a.titleSize}, ${a.fg} on ${a.bg} = ${c.toFixed(2)}:1`);
      check(`${tag} E009 no icon while open`, !a.icon);
      await shot(page, [card(page, E009.ItemID)], `web-${locale}-${width}-open-criterion.png`);

      await card(page, E039.ItemID).locator('[data-checklist-item-header]').click();
      const c39 = await webCard(page, E039.ItemID);
      const c40 = await webCard(page, MOTOR.ItemID);
      check(`${tag} closed E039 has icon and no text`, !c39.open && c39.icon && c39.lines.length === 0);
      check(`${tag} closed Araç Motoru has no icon`, !c40.open && !c40.icon && c40.lines.length === 0);
      await shot(page, [card(page, E039.ItemID), card(page, MOTOR.ItemID)], `web-${locale}-${width}-closed-icon.png`);

      if (width === 1280) {
        await page.evaluate(() => { document.body.dataset.print = 'checklist-eol'; });
        await page.emulateMedia({ media: 'print' });
        const print = await page.locator('.print-root[data-print-id="checklist-eol"]').evaluate((root) => ({
          criteria: [...root.querySelectorAll('[data-print-criteria]')].length,
          text: root.innerText,
        }));
        const lines = print.text.split('\n').filter((l) => l.trim());
        const at = lines.indexOf(`9. ${E009.ItemText}`);
        check(`${tag} print: E009 with both lines`, at >= 0
          && lines[at + 1] === `${L.criterion}: ${E009.AcceptanceCriterion}`
          && lines[at + 2] === `${L.method}: ${E009.ControlMethod}`, lines.slice(at, at + 4).join(' | '));
        const motorBlock = lines[lines.indexOf(`${MOTOR.ItemNo}. ${MOTOR.ItemText}`) + 1] ?? '';
        check(`${tag} print: Araç Motoru has no criteria line`, !motorBlock.startsWith(L.criterion) && !motorBlock.startsWith(L.method), motorBlock);
        const filled = branchItems.filter((i) => i.IsActive && !i.StageClosed)
          .reduce((n, i) => n + (i.AcceptanceCriterion ? 1 : 0) + (i.ControlMethod ? 1 : 0), 0);
        check(`${tag} print: one line per filled field, none for empty ones`, print.criteria === filled,
          `${print.criteria} printed, ${filled} filled (95 method + 39 criterion + 2 tmp)`);
        await page.pdf({ path: path.join(OUT, `print-${locale}.pdf`), format: 'A4', printBackground: true });
        await page.setViewportSize({ width: 794, height: 1123 });
        const e9 = page.locator('.print-root[data-print-id="checklist-eol"] article').nth(8);
        await e9.scrollIntoViewIfNeeded();
        await shot(page, [page.locator('.print-root[data-print-id="checklist-eol"] article').nth(6), page.locator('.print-root[data-print-id="checklist-eol"] article').nth(9)],
          `print-${locale}-items-7-10.png`);
        await page.emulateMedia({ media: 'screen' });
      }
      await context.close();
    }
    // open: method only (KY.FR-19) + frozen branch cards
    {
      const { page, context } = await webPage(locale, width, DEPOT_VIN);
      const b = await webCard(page, FR19_1.ItemID);
      check(`${tag} KY.FR-19 1 open shows only the method`, b.open && JSON.stringify(b.lines.map((l) => [l.label, l.text]))
        === JSON.stringify([[L.method, FR19_1.ControlMethod]]), b.lines.map((l) => `${l.label}: ${l.text}`).join(' / '));
      check(`${tag} KY.FR-19 1 has no criterion label`, !b.text.includes(L.criterion));
      await shot(page, [card(page, FR19_1.ItemID)], `web-${locale}-${width}-open-method.png`);
      const frozen = await page.locator('li[data-checklist-frozen]').evaluateAll((els) => ({
        n: els.length,
        icon: els.filter((el) => el.querySelector('[data-checklist-criteria-icon]')).length,
        text: els.filter((el) => el.querySelector('[data-checklist-criteria]')).length,
      }));
      check(`${tag} frozen branch cards unchanged (no icon, no criteria)`, frozen.n > 0 && frozen.icon === 0 && frozen.text === 0,
        `${frozen.n} frozen cards`);
      if (width === 1280 && locale === 'tr') {
        const e9 = page.locator(`li[data-checklist-frozen][data-checklist-active-item="${E009.ItemID}"]`);
        await shot(page, [e9], 'web-tr-1280-frozen-current.png');
      }
      await context.close();
    }
    // open: neither + long text
    {
      const { page, context } = await webPage(locale, width, KEPT_VIN);
      const n = await webCard(page, BATTERY.ItemID);
      check(`${tag} Batarya open shows no extra text`, n.open && n.lines.length === 0 && !n.icon
        && !n.text.includes(L.criterion) && !n.text.includes(L.method));
      await shot(page, [card(page, BATTERY.ItemID)], `web-${locale}-${width}-open-none.png`);
      const g = await webCard(page, LONG.ItemID);
      const docOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      check(`${tag} long item: no overflow (card, criteria, page)`, g.lines.length === 2 && g.overflow <= 0 && g.dlOverflow <= 0 && docOverflow <= 0,
        `card ${g.overflow}px, criteria ${g.dlOverflow}px, page ${docOverflow}px`);
      await shot(page, [card(page, LONG.ItemID)], `web-${locale}-${width}-long.png`);
      await context.close();
    }
  }
}

// ---------------------------------------------------------------- mobile
console.log('== mobile (react-native-web harness, real EOLChecklistScreen) ==');
const bundle = await build(fs.mkdtempSync(path.join(os.tmpdir(), 'karea-criteria-')));
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };
async function mobilePage(locale, width, vin) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 2 });
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
  await page.goto(`${pathToFileURL(path.join(bundle, 'index.html')).href}?scene=proxy-eol&vin=${vin}&locale=${locale}&theme=light`);
  await page.locator('[data-testid^="eol-item-header-"]').first().waitFor({ timeout: 15000 });
  return { page, posts };
}
const mcard = (page, id) => page.locator(`[data-testid="eol-item-header-${id}"]`).locator('xpath=..');
async function mobileCard(page, id) {
  return mcard(page, id).evaluate((el, itemId) => {
    const box = el.querySelector(`[data-testid="eol-criteria-${itemId}"]`);
    const lines = box ? [...box.querySelectorAll('[data-testid^="eol-criteria-"]')]
      .filter((d) => /-(criterion|method)-/.test(d.getAttribute('data-testid')))
      .map((d) => ({ kind: d.getAttribute('data-testid').split('-')[2], label: d.children[0].textContent, text: d.children[1].textContent })) : [];
    const firstStatus = [...el.querySelectorAll('div[tabindex], [role="button"]')].find((b) => b.getAttribute('data-testid') == null);
    const textEl = box?.querySelector('[data-testid$="-' + itemId + '"] > div:nth-child(2)') ?? box?.children[0]?.children[1];
    const header = el.querySelector(`[data-testid="eol-item-header-${itemId}"]`);
    return {
      lines,
      icon: Boolean(el.querySelector('[data-testid="eol-criteria-icon"]')),
      before: box && firstStatus ? Boolean(box.compareDocumentPosition(firstStatus) & Node.DOCUMENT_POSITION_FOLLOWING) : null,
      fg: textEl ? getComputedStyle(textEl).color : null,
      bg: box ? getComputedStyle(box).backgroundColor : null,
      size: textEl ? getComputedStyle(textEl).fontSize : null,
      titleSize: getComputedStyle(header.querySelector('div')).fontSize,
      overflow: el.scrollWidth - el.clientWidth,
      boxOverflow: box ? box.scrollWidth - box.clientWidth : 0,
      text: el.innerText,
    };
  }, id);
}
async function mshot(page, locators, file) {
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

for (const locale of ['tr', 'en']) {
  const L = LABEL[locale];
  for (const width of [375, 1280]) {
    const tag = `mobile ${locale} ${width}`;
    {
      const { page, posts } = await mobilePage(locale, width, BRANCH_VIN);
      const a = await mobileCard(page, E009.ItemID);
      check(`${tag} E009 open shows both lines`, JSON.stringify(a.lines.map((l) => [l.label, l.text]))
        === JSON.stringify([[L.criterion, E009.AcceptanceCriterion], [L.method, E009.ControlMethod]]),
      a.lines.map((l) => `${l.label}: ${l.text}`).join(' / '));
      check(`${tag} E009 lines above the answer buttons`, a.before === true);
      const c = ratio(a.fg, a.bg);
      check(`${tag} E009 smaller than item text, contrast >= 4.5`, parseFloat(a.size) < parseFloat(a.titleSize) && c >= 4.5,
        `${a.size} vs ${a.titleSize}, ${a.fg} on ${a.bg} = ${c.toFixed(2)}:1`);
      check(`${tag} E009 no icon while open`, !a.icon);
      await mshot(page, [mcard(page, E009.ItemID)], `mobile-${locale}-${width}-open-criterion.png`);
      await page.locator(`[data-testid="eol-item-header-${E039.ItemID}"]`).click();
      const c39 = await mobileCard(page, E039.ItemID);
      const c40 = await mobileCard(page, MOTOR.ItemID);
      check(`${tag} closed E039 has icon and no text`, c39.icon && c39.lines.length === 0);
      check(`${tag} closed Araç Motoru has no icon`, !c40.icon && c40.lines.length === 0);
      await mshot(page, [mcard(page, E039.ItemID), mcard(page, MOTOR.ItemID)], `mobile-${locale}-${width}-closed-icon.png`);
      check(`${tag} read-only (no write request)`, posts.length === 0, String(posts.length));
      await page.close();
    }
    {
      const { page } = await mobilePage(locale, width, DEPOT_VIN);
      const b = await mobileCard(page, FR19_1.ItemID);
      check(`${tag} KY.FR-19 1 open shows only the method`, JSON.stringify(b.lines.map((l) => [l.label, l.text]))
        === JSON.stringify([[L.method, FR19_1.ControlMethod]]) && !b.text.includes(L.criterion),
      b.lines.map((l) => `${l.label}: ${l.text}`).join(' / '));
      await mshot(page, [mcard(page, FR19_1.ItemID)], `mobile-${locale}-${width}-open-method.png`);
      await page.close();
    }
    {
      const { page } = await mobilePage(locale, width, KEPT_VIN);
      const n = await mobileCard(page, BATTERY.ItemID);
      check(`${tag} Batarya open shows no extra text`, n.lines.length === 0 && !n.icon
        && !n.text.includes(L.criterion) && !n.text.includes(L.method));
      await mshot(page, [mcard(page, BATTERY.ItemID)], `mobile-${locale}-${width}-open-none.png`);
      const g = await mobileCard(page, LONG.ItemID);
      const docOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      check(`${tag} long item: no overflow (card, criteria, page)`, g.lines.length === 2 && g.overflow <= 0 && g.boxOverflow <= 0 && docOverflow <= 0,
        `card ${g.overflow}px, criteria ${g.boxOverflow}px, page ${docOverflow}px`);
      await mshot(page, [mcard(page, LONG.ItemID)], `mobile-${locale}-${width}-long.png`);
      await page.close();
    }
  }
}

await browser.close();
console.log(failed ? 'RESULT: FAIL' : 'RESULT: PASS');
process.exit(failed ? 1 : 0);
