/**
 * Mobile issue detail: the VIN hero is a link to the vehicle detail screen.
 * Renders the real IssueDetailScreen through the mobile harness (stubbed
 * data, no backend), taps the VIN and reads the recorded navigation call.
 * Usage (repo root): node docs/screenshots/analysis-labels-vin/verify-mobile-vin-link.mjs
 */
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../mobile-harness/build.mjs';
import { chromium } from '../../../web/node_modules/playwright/index.mjs';
import { scriptOutputDir } from '../lib/output-dir.mjs';

const OUT = scriptOutputDir(import.meta.url);
const bundle = await build(fs.mkdtempSync(path.join(os.tmpdir(), 'karea-vin-link-')));
const browser = await chromium.launch({ headless: true });
let failed = false;

for (const locale of ['tr', 'en']) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${pathToFileURL(path.join(bundle, 'index.html')).href}?scene=issue-detail&locale=${locale}&theme=light`);
  const link = page.getByTestId('issue-vehicle-link');
  await link.waitFor({ timeout: 15000 });
  const facts = await link.evaluate((el) => ({
    role: el.getAttribute('role'),
    label: el.getAttribute('aria-label'),
    cursor: getComputedStyle(el).cursor,
    tailDecoration: [...el.querySelectorAll('div')].map((d) => getComputedStyle(d).textDecorationLine).find((d) => d.includes('underline')) ?? 'none',
    chevron: !!el.querySelector('svg'),
  }));
  await page.screenshot({ path: path.join(OUT, `mobile-issue-detail-vin-${locale}-390.png`), clip: { x: 0, y: 0, width: 390, height: 260 } });
  await link.click();
  const nav = await page.evaluate(() => window.__nav);
  const ok = nav.length === 1 && nav[0].name === 'VehicleStation' && nav[0].params?.vin === 'KAREA0LAYOUT00042';
  console.log(locale, JSON.stringify({ ...facts, nav, errors }), ok ? 'OK' : 'FAIL');
  if (!ok || errors.length || !facts.chevron || facts.tailDecoration === 'none') failed = true;
  await page.close();
}

await browser.close();
fs.rmSync(bundle, { recursive: true, force: true });
if (failed) {
  console.error('mobile vin link: FAILED');
  process.exit(1);
}
console.log('mobile vin link: ok');
