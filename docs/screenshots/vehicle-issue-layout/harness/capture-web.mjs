/**
 * Web: vehicle detail issue list + station steps, and the Issues board for
 * consistency. Every API call is answered from fixtures (page.route) with a
 * fake session, so no backend login and no database access happen.
 *
 *   WEB_BASE=http://localhost:5173 node capture-web.mjs <prefix>
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pw from '../../../../web/node_modules/playwright/index.js';
import { fixtureIssues, fixtureSteps, fixtureVehicle } from './fixtures.mjs';
import { outputDir } from '../../lib/output-dir.mjs';

const { chromium } = pw;
const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = outputDir(path.resolve(here, '..'));
const prefix = process.argv[2] ?? 'after';
const WEB = process.env.WEB_BASE || 'http://localhost:5173';
const API = process.env.VITE_API_BASE_URL || 'http://localhost:8080/api/v1';
const VIN = fixtureVehicle.VIN;

const session = {
  token: 'fixture-token',
  user: { ID: 1, FullName: 'Layout Fixture', Email: 'fixture@karea.local', Role: 'MANAGER_ADMIN', IsActive: true },
  permissions: [
    'web.access', 'vehicle.view', 'station.step.edit', 'issue.view', 'issue.create',
    'checklist.shipment.view', 'checklist.test.view', 'checklist.eol.view',
  ],
};

function respond(url) {
  const p = new URL(url).pathname.replace(/^\/api\/v1/, '');
  if (p === `/vehicles/${VIN}`) return fixtureVehicle;
  if (p === `/vehicles/${VIN}/station-steps`) {
    return { Items: fixtureSteps, OpenIssuesByStation: { 2: 2, 4: 1 } };
  }
  if (p === '/issues') return { items: fixtureIssues, has_more: false };
  if (p === `/vehicles/${VIN}/shipment-readiness`) return null;
  if (p.startsWith('/vehicles/') && p.endsWith('/status-history')) return { items: [] };
  return { items: [], Items: [] };
}

const browser = await chromium.launch({ headless: true });
let failed = false;

async function capture(route, name, width, waitText) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2 });
  await context.addInitScript((s) => {
    localStorage.setItem('karea.auth.session', JSON.stringify(s));
    localStorage.setItem('karea-locale', 'tr');
    localStorage.setItem('karea-theme-mode', 'light');
  }, session);
  const page = await context.newPage();
  await page.route('**/*', (r) => {
    const url = r.request().url();
    if (!url.startsWith(API)) return r.continue();
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(respond(url)) });
  });
  await page.goto(`${WEB}${route}`);
  await page.getByText(waitText).first().waitFor({ timeout: 20_000 });
  // Measure only after fonts and the virtualized grid have settled.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
  const overflow = await page.evaluate(() => {
    const bad = [];
    for (const card of document.querySelectorAll('article, [data-station-row]')) {
      const box = card.getBoundingClientRect();
      for (const el of card.querySelectorAll('*')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0 || el.closest('.sr-only')) continue;
        if (r.right > box.right + 1 || r.left < box.left - 1 || r.bottom > box.bottom + 1 || r.top < box.top - 1) {
          bad.push((el.textContent ?? '').slice(0, 30));
        }
      }
    }
    return { docOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth, bad: bad.slice(0, 5) };
  });
  const ok = !overflow.docOverflow && overflow.bad.length === 0;
  console.log(`${prefix} web ${name} ${width}px overflow`, ok ? 'none' : JSON.stringify(overflow));
  if (!ok && prefix === 'after') failed = true;
  if (name !== 'stations') {
    const layout = await page.evaluate(() =>
      [...document.querySelectorAll('article')].map((card) => {
        const bars = card.querySelector('[data-severity-bars]');
        const badge = card.querySelector('span.rounded-full');
        const desc = card.querySelector('p');
        const g = bars.parentElement.getBoundingClientRect();
        const s = badge.getBoundingClientRect();
        const d = desc.getBoundingClientRect();
        return {
          text: card.innerText,
          filled: Number(bars.getAttribute('data-severity-bars')),
          // Status on the description's row, right edge shared with severity.
          statusTopRight: Math.abs(s.top - d.top) <= 6 && s.left >= d.right,
          barsBottomRight: g.top > s.bottom && Math.abs(g.right - s.right) <= 2,
        };
      }),
    );
    const sevWords = /\b(Kritik|Orta|Düşük)\b/;
    const expectLabel = name === 'issues-board';
    const labelsOk = layout.every((c) => sevWords.test(c.text) === expectLabel);
    const cornersOk = layout.every((c) => c.statusTopRight && c.barsBottomRight);
    if (!cornersOk) {
      console.log(JSON.stringify(layout.filter((c) => !(c.statusTopRight && c.barsBottomRight))));
    }
    const filled = layout.map((c) => c.filled).sort().join(',');
    console.log(
      `${prefix} web ${name} ${width}px severity text ${expectLabel ? 'shown' : 'hidden'}: ${labelsOk}; corners: ${cornersOk}; filled bars: ${filled}`,
    );
    if (prefix === 'after' && (!labelsOk || !cornersOk || filled !== '1,2,2,3')) failed = true;
  }
  const target = page.getByText(waitText).first();
  await target.scrollIntoViewIfNeeded();
  const out = path.join(outDir, `${prefix}-web-${name}-${width}.png`);
  await page.screenshot({ path: out, fullPage: true });
  console.log('wrote', out);
  await context.close();
}

for (const width of [375, 390, 430, 1280]) {
  await capture(`/vehicles/${VIN}?tab=issues`, 'issues-tab', width, 'Sol ön kapı');
}
for (const width of [390, 1280]) {
  await capture(`/vehicles/${VIN}?tab=overview`, 'stations', width, 'Boya kontrol');
  await capture('/issues', 'issues-board', width, 'Sol ön kapı');
}

await browser.close();
if (failed) process.exit(1);
