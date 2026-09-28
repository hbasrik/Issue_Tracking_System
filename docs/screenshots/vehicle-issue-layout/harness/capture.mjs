/**
 * Captures the real mobile VehicleStationScreen (react-native-web bundle
 * from build.mjs) at phone widths, plus a severity icon comparison.
 * Usage: node capture.mjs <bundleDir> <prefix>   (prefix: before | after)
 * Also asserts no horizontal overflow inside issue cards / station rows.
 */
import { chromium } from '../../../../web/node_modules/playwright/index.mjs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, '..');
const bundle = path.resolve(process.argv[2]);
const prefix = process.argv[3] ?? 'after';
const url = (q) => `${pathToFileURL(path.join(bundle, 'index.html')).href}?${q}`;

const browser = await chromium.launch({ headless: true });
let failed = false;

for (const width of [375, 390, 430]) {
  const page = await browser.newPage({
    viewport: { width, height: 800 },
    deviceScaleFactor: 2,
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(url('theme=light&locale=tr'));
  await page.waitForSelector('text=Sol ön kapı', { timeout: 10_000 });
  if (errors.length) {
    console.error('page errors', errors);
    failed = true;
  }
  // Let the ScrollView content define the page height so one shot covers the list.
  await page.addStyleTag({
    content: 'html,body,#root{height:auto!important;min-height:0!important} *{overflow-y:visible!important}',
  });
  const overflow = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const bad = [];
    for (const el of document.querySelectorAll('div,span')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > vw + 0.5 || r.left < -0.5)) {
        bad.push(`${el.textContent?.slice(0, 40)} [${Math.round(r.left)},${Math.round(r.right)}]`);
      }
    }
    return { vw, scrollW: document.documentElement.scrollWidth, bad: bad.slice(0, 5) };
  });
  const ok = overflow.scrollW <= overflow.vw && overflow.bad.length === 0;
  console.log(`${prefix} ${width}px overflow`, ok ? 'none' : JSON.stringify(overflow));
  if (!ok && prefix === 'after') failed = true;

  const issuesTop = await page.locator('text=Sol ön kapı').first().boundingBox();
  const full = path.join(outDir, `${prefix}-${width}.png`);
  await page.screenshot({
    path: full,
    fullPage: true,
    clip: {
      x: 0,
      y: Math.max(0, (issuesTop?.y ?? 0) - 90),
      width,
      height: 1150,
    },
  });
  console.log('wrote', full);
  await page.close();
}

for (const theme of ['light', 'dark']) {
  const page = await browser.newPage({ viewport: { width: 400, height: 210 }, deviceScaleFactor: 3 });
  await page.goto(url(`view=severity&theme=${theme}`));
  await page.waitForSelector('text=CRITICAL · 3 · md');
  const out = path.join(outDir, `${prefix}-severity-${theme}.png`);
  await page.screenshot({ path: out });
  console.log('wrote', out);
  await page.close();
}

await browser.close();
if (failed) process.exit(1);
