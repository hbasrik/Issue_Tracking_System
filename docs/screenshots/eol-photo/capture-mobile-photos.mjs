// Mobile EoL item photos (docs/16 A44) on the react-native-web harness: the
// real EOLChecklistScreen with stubbed API (no backend, nothing written).
// Item 1 carries 3 photos, item 2 one, the rest none; every photo is shown
// and tapping one opens the full-size viewer.
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from '../mobile-harness/build.mjs';
import { chromium } from '../../../web/node_modules/playwright/index.mjs';

const OUT = path.dirname(fileURLToPath(import.meta.url));
const bundle = await build(fs.mkdtempSync(path.join(os.tmpdir(), 'karea-eol-photos-')));
const browser = await chromium.launch({ headless: true });
const CLOSE = { tr: 'Kapat', en: 'Close' };
let failed = false;
const check = (key, label, ok, detail = '') => {
  console.log(`${key} [${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed = true;
};

for (const locale of ['tr', 'en']) {
  for (const width of [375, 1280]) {
    const key = `photos-${locale}-${width}`;
    const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 2 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`${pathToFileURL(path.join(bundle, 'index.html')).href}?scene=eol-photos-list&locale=${locale}&theme=light`);
    await page.waitForFunction(() => document.querySelectorAll('#root div').length > 20, null, { timeout: 15000 });
    await page.waitForTimeout(400);
    const strips = page.locator('[data-testid="checklist-item-photos"]');
    const counts = await strips.evaluateAll((els) => els.map((el) => el.querySelectorAll('img').length));
    check(key, 'photo strips per item are [3,1]', JSON.stringify(counts) === '[3,1]', JSON.stringify(counts));
    const loaded = await strips.locator('img').evaluateAll((els) => els.filter((el) => el.complete && el.naturalWidth > 0).length);
    check(key, 'all 4 thumbnails loaded', loaded === 4, `${loaded}/4`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    check(key, 'no horizontal overflow', !overflow);
    const first = strips.first();
    await first.scrollIntoViewIfNeeded();
    const a = await first.boundingBox();
    const b = await strips.nth(1).boundingBox();
    await page.screenshot({
      path: path.join(OUT, `mobile-${key}.png`),
      clip: { x: 0, y: Math.max(0, a.y - 60), width, height: Math.min(900, b.y + b.height - a.y + 120) },
    });
    await first.locator('[role="button"], [role="img"], img').first().click();
    await page.waitForTimeout(400);
    const close = page.getByText(CLOSE[locale], { exact: true });
    check(key, 'tap opens full-size viewer', await close.isVisible());
    if (width === 375) await page.screenshot({ path: path.join(OUT, `mobile-${key}-viewer.png`) });
    check(key, 'no page errors', errors.length === 0, errors.join('; '));
    await page.close();
  }
}
await browser.close();
fs.rmSync(bundle, { recursive: true, force: true });
console.log(failed ? 'MOBILE PHOTO CHECKS FAILED' : 'MOBILE PHOTO CHECKS PASSED');
process.exit(failed ? 1 : 0);
