// EoL form sections on screen (docs/16 A55), read-only, against the test API
// on :18081 / karea_eolnote_test (seeds 01-06, never live).
// Web (Vite :5175): N7V1K1SA1TK000012 at the depot — branch panel (KY.FR-09)
// and depot panel (KY.FR-19). Mobile (react-native-web harness, real
// EOLChecklistScreen): N7V1K1SA8TK000007 at the branch, N7V1K1SA1TK000012 at
// the depot. TR and EN at 1280 and 375: headings in paper order, both "Dış"
// groups present, the 9 kept items under "Other items", no raw section key.
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from '../mobile-harness/build.mjs';
import { chromium } from '../../../web/node_modules/playwright/index.mjs';

const OUT = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:5175';
const API = 'http://localhost:18081/api/v1';
const BRANCH_VIN = 'N7V1K1SA8TK000007';
const DEPOT_VIN = 'N7V1K1SA1TK000012';

const EXPECT = {
  tr: {
    branch: ['Giriş', 'Dış', 'Gap & flush', 'Dış', 'İç', 'Diğer maddeler'],
    depot: ['Kimlik & Evrak', 'Dış Görünüş', 'Kapılar', 'İç Donanım', 'Mekanik', 'Elektrik',
      'Fonksiyon', 'Yol Testi', 'Sevkiyat', 'Diğer maddeler'],
  },
  en: {
    branch: ['Entry', 'Exterior', 'Gap & flush', 'Exterior', 'Interior', 'Other items'],
    depot: ['Identity & documents', 'Exterior appearance', 'Doors', 'Interior equipment', 'Mechanical',
      'Electrical', 'Function', 'Road test', 'Shipment', 'Other items'],
  },
};
const BRANCH_KEYS = ['eol_entry', 'eol_exterior', 'eol_gap_flush', 'eol_exterior_2', 'eol_interior', '__other'];
const DEPOT_KEYS = ['final_identity', 'final_exterior', 'final_doors', 'final_interior', 'final_mechanical',
  'final_electrical', 'final_function', 'final_road_test', 'final_shipment', '__other'];
const RAW = /^[a-z0-9_]+$/;

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

function checkHeadings(label, sections, keys, titles, counts) {
  check(`${label}: section keys in paper order`, JSON.stringify(sections.map((s) => s.key)) === JSON.stringify(keys),
    sections.map((s) => s.key).join(', '));
  check(`${label}: headings`, JSON.stringify(sections.map((s) => s.title)) === JSON.stringify(titles),
    sections.map((s) => `${s.title} (${s.items})`).join(' | '));
  const raw = sections.filter((s) => RAW.test(s.title));
  check(`${label}: no raw section key on screen`, raw.length === 0, raw.map((s) => s.title).join(', ') || 'none');
  check(`${label}: item counts per section`, JSON.stringify(sections.map((s) => s.items)) === JSON.stringify(counts),
    sections.map((s) => s.items).join(','));
}

const browser = await chromium.launch({ headless: true });

console.log('== web ==');
for (const locale of ['tr', 'en']) {
  for (const [width, height] of [[1280, 900], [375, 740]]) {
    const label = `web ${locale} ${width}`;
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
    await context.addInitScript((data) => {
      localStorage.setItem('karea.auth.session', JSON.stringify(data.session));
      localStorage.setItem('karea-theme-mode', 'light');
      localStorage.setItem('karea-locale', data.locale);
    }, { session: { token: session.token, user: session.user, permissions: session.permissions }, locale });
    const page = await context.newPage();
    await page.goto(`${BASE}/vehicles/${DEPOT_VIN}?tab=eol`, { waitUntil: 'networkidle' });
    const panels = page.locator('div[data-checklist-active-total]');
    await panels.nth(1).waitFor({ timeout: 15000 });
    for (const [i, phase, keys, counts] of [[0, 'branch', BRANCH_KEYS, [2, 4, 4, 8, 21, 7]],
      [1, 'depot', DEPOT_KEYS, [5, 9, 6, 7, 7, 8, 4, 5, 5, 2]]]) {
      const panel = panels.nth(i);
      const sections = await panel.locator('li[data-checklist-section]').evaluateAll((els) => els.map((el) => ({
        key: el.getAttribute('data-checklist-section'),
        title: el.querySelector(':scope > p')?.textContent?.trim() ?? '',
        items: el.querySelectorAll('li[data-checklist-active-item]').length,
      })));
      checkHeadings(`${label} ${phase}`, sections, keys, EXPECT[locale][phase], counts);
      await panel.evaluate((el) => el.scrollIntoView({ block: 'start' }));
      const box = await panel.boundingBox();
      await page.screenshot({
        path: path.join(OUT, `web-${locale}-${width}-${phase}.png`),
        clip: { x: box.x, y: Math.max(box.y, 0), width: box.width, height: Math.min(box.height, height - Math.max(box.y, 0)) },
      });
      // Scroll the second "Dış" / last group into view to show it too.
      const tail = panel.locator(`li[data-checklist-section="${phase === 'branch' ? 'eol_exterior_2' : '__other'}"]`);
      await tail.evaluate((el) => el.scrollIntoView({ block: 'start' }));
      await page.screenshot({ path: path.join(OUT, `web-${locale}-${width}-${phase}-${phase === 'branch' ? 'exterior2' : 'other'}.png`) });
    }
    await context.close();
  }
}

console.log('== mobile (react-native-web harness, real EOLChecklistScreen) ==');
const bundle = await build(fs.mkdtempSync(path.join(os.tmpdir(), 'karea-form-seed-')));
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };
for (const locale of ['tr', 'en']) {
  for (const width of [375, 1280]) {
    for (const [vin, phase, keys, counts] of [[BRANCH_VIN, 'branch', BRANCH_KEYS, [2, 4, 4, 8, 21, 7]],
      [DEPOT_VIN, 'depot', DEPOT_KEYS, [5, 9, 6, 7, 7, 8, 4, 5, 5, 2]]]) {
      const label = `mobile ${locale} ${width} ${phase}`;
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
      await page.waitForFunction(() => window.__calls?.some((c) => String(c.name).includes('/checklist/eol')), null, { timeout: 15000 });
      await page.locator('[data-testid^="eol-section-"]').first().waitFor({ timeout: 15000 });
      const sections = await page.locator('[data-testid^="eol-section-"]').evaluateAll((els) => els.map((el) => ({
        key: el.getAttribute('data-testid').replace('eol-section-', ''),
        title: el.firstElementChild?.textContent?.trim() ?? '',
        items: el.querySelectorAll('[data-testid^="eol-item-header-"]').length,
      })));
      checkHeadings(label, sections, keys, EXPECT[locale][phase], counts);
      check(`${label}: read-only (no write request)`, posts.length === 0, `${posts.length}`);
      if (width === 375) {
        await page.locator('[data-testid^="eol-section-"]').first().scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(OUT, `mobile-${locale}-375-${phase}.png`) });
        const tail = page.locator(`[data-testid="eol-section-${phase === 'branch' ? 'eol_exterior_2' : '__other'}"]`);
        await tail.evaluate((el) => el.scrollIntoView({ block: 'start' }));
        await page.screenshot({ path: path.join(OUT, `mobile-${locale}-375-${phase}-${phase === 'branch' ? 'exterior2' : 'other'}.png`) });
      }
      await page.close();
    }
  }
}

await browser.close();
console.log(failed ? 'RESULT: FAIL' : 'RESULT: PASS');
process.exit(failed ? 1 : 0);
