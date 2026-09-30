/**
 * Analysis catalogue-adequacy card, defect chart labels (screen + print)
 * and the web issue-detail VIN link, rendered from fixture.mjs.
 *
 * Starts its own Vite dev server on 127.0.0.1:15173 with the API base set
 * to 127.0.0.1:18081, where nothing listens: every API request is answered
 * by Playwright from the fixture. Any request to :8080 is aborted and
 * counted. No login, no database. The Vite child is killed on exit.
 *
 * Usage (repo root): node docs/screenshots/analysis-labels-vin/capture.mjs before|after
 * Writes <phase>-*.png and <phase>-facts.json next to this file.
 */
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from '../../../web/node_modules/playwright/index.mjs';
import { dashboard, stations, issue, session } from './fixture.mjs';

const phase = process.argv[2];
if (phase !== 'before' && phase !== 'after') throw new Error('usage: capture.mjs before|after');
const OUT = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(OUT, '../../../web');
const PORT = 15173;
const BASE = `http://127.0.0.1:${PORT}`;
const API_HOST = '127.0.0.1:18081';

const vite = spawn(
  path.join(WEB, 'node_modules/.bin/vite'),
  ['--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
  { cwd: WEB, env: { ...process.env, VITE_API_BASE_URL: `http://${API_HOST}/api/v1` }, stdio: 'pipe' },
);
let viteLog = '';
vite.stdout.on('data', (d) => (viteLog += d));
vite.stderr.on('data', (d) => (viteLog += d));
const stopVite = () => {
  if (vite.exitCode == null) vite.kill('SIGTERM');
};
process.on('exit', stopVite);

async function waitForVite() {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(BASE);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`vite did not start:\n${viteLog}`);
}

const blocked8080 = [];
const unknown = new Set();
function apiResponse(url) {
  const p = url.pathname.replace(/^\/api\/v1/, '');
  if (p === '/analysis/dashboard') return dashboard;
  if (p === '/stations') return { items: stations };
  if (p === '/issue-types') return { items: [{ ID: 1, Name: 'Hata' }, { ID: 2, Name: 'Tamir Gerekiyor' }] };
  if (p === `/issues/${issue.ID}`) return issue;
  if (p === `/issues/${issue.ID}/history`) return { items: [] };
  if (p.startsWith('/media')) return { items: [] };
  if (p.startsWith('/vehicles/')) return { VIN: issue.VIN, CurrentGlobalStatus: 'IN_PRODUCTION', TotalProgressPercentage: 40 };
  unknown.add(p);
  return { items: [] };
}

async function newPage(browser, width, height = 1000) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  await context.addInitScript((s) => {
    localStorage.setItem('karea.auth.session', JSON.stringify(s));
    localStorage.setItem('karea-locale', 'tr');
    localStorage.setItem('karea-theme-mode', 'light');
    window.print = () => {
      window.__printCalled = true;
    };
  }, session);
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.port === '8080') {
      blocked8080.push(url.href);
      return route.abort();
    }
    if (url.host === API_HOST) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' },
        body: JSON.stringify(apiResponse(url)),
      });
    }
    return route.continue();
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  return { page, context, errors };
}

const card = (page, title) =>
  page.locator('h2', { hasText: title }).first().locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]');

/** Y-axis category ticks: line count per tick and vertical overlaps between neighbours. */
function tickFacts(root) {
  const ticks = [...root.querySelectorAll('.recharts-yAxis .recharts-cartesian-axis-tick text')];
  const boxes = ticks.map((t) => {
    const r = t.getBoundingClientRect();
    return {
      text: t.textContent,
      title: t.querySelector('title')?.textContent ?? null,
      lines: Math.max(1, t.querySelectorAll('tspan').length),
      top: r.top,
      bottom: r.bottom,
      left: r.left,
      right: r.right,
    };
  });
  let overlaps = 0;
  const sorted = [...boxes].sort((a, b) => a.top - b.top);
  for (let i = 1; i < sorted.length; i++) if (sorted[i].top < sorted[i - 1].bottom - 0.5) overlaps++;
  const plot = root.querySelector('.recharts-cartesian-grid')?.getBoundingClientRect();
  const intoPlot = plot ? boxes.filter((b) => b.right > plot.left + 0.5).length : null;
  return { count: boxes.length, multiLine: boxes.filter((b) => b.lines > 1).length, overlaps, intoPlot, ticks: boxes.map(({ text, title, lines }) => ({ text, title, lines })) };
}

const CHARTS = [
  ['parts', 'En çok hata çıkan parçalar'],
  ['types', 'Kusur tipine göre dağılım'],
  ['combo', 'Parça × kusur tipi'],
  ['hotspots', 'Tekrarın yoğunlaştığı kombinasyonlar'],
  ['issue-types', 'En sık issue türleri'],
  ['reporters', 'Bildirene göre açılan hatalar'],
  ['stations', 'İstasyon — açık hatalar'],
];

await waitForVite();
const browser = await chromium.launch({ headless: true });
const facts = { phase, screen: {}, print: {}, vin: null };

for (const width of [1280, 1920]) {
  const { page, context, errors } = await newPage(browser, width);
  await page.goto(`${BASE}/analysis?from=2026-09-01&to=2026-09-30`, { waitUntil: 'networkidle' });
  const coverage = card(page, 'Katalog yeterliliği');
  await coverage.waitFor({ timeout: 20000 });
  await coverage.scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  await coverage.screenshot({ path: path.join(OUT, `${phase}-coverage-${width}.png`) });
  const w = { coverageText: await coverage.innerText(), charts: {}, errors };
  const section = page
    .locator('h2', { hasText: 'Hata sınıflandırması' })
    .first()
    .locator('xpath=ancestor::div[contains(@class,"mt-5")][1]/following-sibling::div[contains(@class,"grid")][1]');
  if (await section.count()) {
    await section.scrollIntoViewIfNeeded();
    await section.screenshot({ path: path.join(OUT, `${phase}-defect-section-${width}.png`) });
  }
  for (const [key, title] of CHARTS) {
    const c = card(page, title);
    if (!(await c.count())) {
      w.charts[key] = 'missing';
      continue;
    }
    await c.scrollIntoViewIfNeeded();
    if (['parts', 'combo'].includes(key)) await c.screenshot({ path: path.join(OUT, `${phase}-${key}-${width}.png`) });
    w.charts[key] = await c.evaluate(tickFacts);
  }
  if (phase === 'after') {
    const c = card(page, 'En çok hata çıkan parçalar');
    const tick = c.locator('.recharts-yAxis .recharts-cartesian-axis-tick text').first();
    await tick.hover();
    await page.waitForTimeout(300);
    w.hoverFirstPartTick = await tick.evaluate((el) => ({ shown: el.textContent, title: el.querySelector('title')?.textContent }));
    const bar = c.locator('.recharts-bar-rectangle').first();
    await bar.hover();
    await page.waitForTimeout(300);
    w.barTooltip = await c.locator('.recharts-tooltip-wrapper').innerText().catch(() => null);
    await c.screenshot({ path: path.join(OUT, `${phase}-parts-hover-${width}.png`) });
  }
  facts.screen[width] = w;

  if (width === 1280) {
    await page.getByRole('button', { name: /Yazdır/ }).first().click();
    await page.waitForFunction(() => document.body.dataset.print === 'analysis', null, { timeout: 10000 });
    await page.emulateMedia({ media: 'print' });
    await page.waitForTimeout(800);
    for (const [key, title] of [['parts', 'En çok hata çıkan parçalar'], ['combo', 'Parça × kusur tipi'], ['coverage', 'Hata sınıflandırması']]) {
      const el = key === 'coverage'
        ? page.locator('.print-root section.print-section', { has: page.locator('h2', { hasText: title }) }).first()
        : page.locator('.print-root .print-chart-card', { has: page.locator('h2', { hasText: title }) }).first();
      if (!(await el.count())) {
        facts.print[key] = 'missing';
        continue;
      }
      await el.screenshot({ path: path.join(OUT, `${phase}-print-${key}.png`) });
      facts.print[key] = key === 'coverage' ? await el.innerText() : await el.evaluate(tickFacts);
    }
    await page.emulateMedia({ media: 'screen' });
  }
  await context.close();
}

if (phase === 'after') {
  const { page, context, errors } = await newPage(browser, 1280);
  await page.goto(`${BASE}/issues/${issue.ID}`, { waitUntil: 'networkidle' });
  const link = page.getByTestId('issue-vehicle-link');
  await link.waitFor({ timeout: 15000 });
  const hero = link.locator('xpath=ancestor::div[1]');
  await hero.screenshot({ path: path.join(OUT, 'after-web-issue-vin-1280.png') });
  const attrs = await link.evaluate((el) => ({ tag: el.tagName, href: el.getAttribute('href'), label: el.getAttribute('aria-label'), cursor: getComputedStyle(el).cursor }));
  await link.click();
  await page.waitForURL(/\/vehicles\//, { timeout: 10000 });
  facts.vin = { ...attrs, urlAfterClick: new URL(page.url()).pathname, errors };
  await context.close();
}

await browser.close();
facts.blockedRequestsTo8080 = blocked8080;
facts.unmockedApiPaths = [...unknown].sort();
fs.writeFileSync(path.join(OUT, `${phase}-facts.json`), JSON.stringify(facts, null, 1));
stopVite();
for (const [w, v] of Object.entries(facts.screen)) {
  console.log(`screen ${w}: errors=${v.errors.length}`);
  for (const [k, c] of Object.entries(v.charts)) {
    console.log(`  ${k}: ${typeof c === 'string' ? c : `ticks=${c.count} multiLine=${c.multiLine} overlaps=${c.overlaps} intoPlot=${c.intoPlot}`}`);
  }
}
for (const [k, c] of Object.entries(facts.print)) {
  if (typeof c === 'object') console.log(`print ${k}: ticks=${c.count} multiLine=${c.multiLine} overlaps=${c.overlaps} intoPlot=${c.intoPlot}`);
}
if (facts.vin) console.log('vin', JSON.stringify(facts.vin));
console.log('blocked 8080 requests:', blocked8080.length, 'unmocked:', facts.unmockedApiPaths.join(', ') || 'none');
