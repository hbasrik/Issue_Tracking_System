// Web EoL item photos + 50-item list, against the test API on
// karea_eolnote_test (never the live DB). Run after run-photos-verification.py api.
import { chromium } from '../../../web/node_modules/playwright/index.mjs';
import path from 'path';
import { fileURLToPath } from 'url';
import { scriptOutputDir } from '../lib/output-dir.mjs';

const OUT = scriptOutputDir(import.meta.url);
const BASE = 'http://localhost:5175';
const API = 'http://localhost:18081/api/v1';
const VIN = 'N7V1K1SA0TK000003';

const session = await (
  await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'manager@karea.local', password: 'changeme123' }),
  })
).json();

const browser = await chromium.launch({ headless: true });
let failed = false;
for (const width of [1280, 375]) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
  await context.addInitScript((data) => {
    localStorage.setItem('karea.auth.session', JSON.stringify(data));
    localStorage.setItem('karea-theme-mode', 'light');
    localStorage.setItem('karea-locale', 'tr');
  }, { token: session.token, user: session.user, permissions: session.permissions });
  const page = await context.newPage();
  await page.goto(`${BASE}/vehicles/${VIN}?tab=eol`, { waitUntil: 'networkidle' });
  const first = page.locator('[data-checklist-active-item]').first();
  await first.waitFor({ timeout: 15000 });
  await page.waitForTimeout(800);
  const counts = await page.locator('[data-checklist-photos]').evaluateAll((els) =>
    els.map((e) => Number(e.getAttribute('data-checklist-photos'))),
  );
  const loaded = await page.locator('[data-checklist-photos] img').evaluateAll((imgs) =>
    imgs.map((i) => i.complete && i.naturalWidth > 0),
  );
  const rows = await page.locator('[data-checklist-active-item]').count();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  console.log(`${width}px: ${rows} item rows; photo strips ${JSON.stringify(counts)}; thumbnails loaded ${loaded.filter(Boolean).length}/${loaded.length}; horizontal overflow ${overflow}`);
  if (JSON.stringify(counts) !== '[3,1]' || loaded.some((l) => !l) || overflow) failed = true;

  await first.scrollIntoViewIfNeeded();
  const a = await first.boundingBox();
  const b = await page.locator('[data-checklist-active-item]').nth(1).boundingBox();
  await page.screenshot({
    path: path.join(OUT, `web-tr-${width}-photos.png`),
    clip: { x: 0, y: Math.max(0, a.y - 10), width, height: b.y + b.height - a.y + 20 },
  });
  // The EoL list scrolls inside the app shell; a tall viewport shows all 50 rows.
  const listHeight = await first.locator('xpath=..').evaluate((el) => el.scrollHeight);
  await page.setViewportSize({ width, height: listHeight + 900 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, `web-tr-${width}-50-items.png`) });
  await page.setViewportSize({ width, height: 900 });

  await page.locator('[data-checklist-photos] button').first().click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('img').waitFor();
  await page.waitForTimeout(400);
  const big = await dialog.locator('img').evaluate((i) => i.naturalWidth);
  console.log(`${width}px: lightbox opened, original naturalWidth=${big}`);
  if (!big) failed = true;
  if (width === 1280) await page.screenshot({ path: path.join(OUT, 'web-tr-1280-lightbox.png') });
  await context.close();
}
await browser.close();
console.log(failed ? 'WEB CHECKS FAILED' : 'WEB CHECKS PASSED');
process.exit(failed ? 1 : 0);
