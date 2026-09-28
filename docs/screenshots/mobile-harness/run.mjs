/**
 * Renders real mobile screens (react-native-web) and screenshots them at
 * phone widths. Scenes live in scenes.ts; data comes from stubs, no backend.
 *
 * Usage (from mobile/):  npm run screenshots -- <outDir> [scene,scene] [--locales tr,en]
 *   or: node docs/screenshots/mobile-harness/run.mjs <outDir> ...
 * Writes <scene>-<locale>-<width>[-open].png and facts.json into <outDir>.
 * Exits non-zero on page errors, horizontal overflow or raw status text in
 * the collapsed checklist sections.
 */
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { build } from './build.mjs';
import { chromium } from '../../../web/node_modules/playwright/index.mjs';

const WIDTHS = [375, 390, 430];
const TOGGLES = ['checklist-stage-closed-toggle', 'checklist-inactive-toggle'];
const RAW_STATUS = /\b(PENDING|NOT_OK|CONDITIONAL_OK)\b/;

const args = process.argv.slice(2);
const localeIdx = args.indexOf('--locales');
const locales = localeIdx >= 0 ? args[localeIdx + 1].split(',') : ['tr'];
const positional = args.filter((a, i) => !a.startsWith('--') && !(localeIdx >= 0 && i === localeIdx + 1));
if (!positional[0]) throw new Error('usage: run.mjs <outDir> [scene,scene] [--locales tr,en]');
const outDir = path.resolve(positional[0]);
const sceneArg = positional[1];

const bundle = await build(fs.mkdtempSync(path.join(os.tmpdir(), 'karea-mobile-harness-')));
const allScenes = [...fs.readFileSync(new URL('./scenes.ts', import.meta.url), 'utf8').matchAll(/id: '([a-z-]+)',\n\s+screen:/g)].map((m) => m[1]);
const scenes = sceneArg ? sceneArg.split(',') : allScenes;
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const facts = {};
let failed = false;

async function fitAndShoot(page, width, file) {
  const h = await page.evaluate(() =>
    Math.max(...[...document.querySelectorAll('div')].map((d) => d.scrollHeight), 600),
  );
  await page.setViewportSize({ width, height: Math.min(h, 5000) });
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(outDir, file) });
}

async function sectionTexts(page) {
  return page.evaluate((ids) => {
    const out = {};
    for (const id of ids) {
      const toggle = document.querySelector(`[data-testid="${id}"]`);
      out[id] = toggle ? toggle.parentElement.innerText : null;
    }
    return out;
  }, TOGGLES);
}

for (const scene of scenes) {
  for (const locale of locales) {
    for (const width of WIDTHS) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 2 });
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      const url = `${pathToFileURL(path.join(bundle, 'index.html')).href}?scene=${scene}&locale=${locale}&theme=light`;
      await page.goto(url);
      await page.waitForFunction(() => document.querySelectorAll('#root div').length > 20, null, { timeout: 15000 });
      await page.waitForTimeout(400);
      const key = `${scene}-${locale}-${width}`;
      await fitAndShoot(page, width, `${key}.png`);
      const present = [];
      for (const id of TOGGLES) {
        const t = page.locator(`[data-testid="${id}"]`);
        if (await t.count()) {
          present.push(id);
          await t.click();
        }
      }
      const texts = await sectionTexts(page);
      if (present.length) await fitAndShoot(page, width, `${key}-open.png`);
      const overflow = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        return [...document.querySelectorAll('div,span')].filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && (r.right > vw + 0.5 || r.left < -0.5);
        }).length;
      });
      const raw = Object.entries(texts).filter(([, v]) => v && RAW_STATUS.test(v)).map(([k]) => k);
      facts[key] = { sections: texts, overflow, raw_status_in_sections: raw, errors, calls: await page.evaluate(() => window.__calls) };
      if (errors.length || overflow || raw.length) failed = true;
      await page.close();
    }
  }
}

await browser.close();
fs.writeFileSync(path.join(outDir, 'facts.json'), JSON.stringify(facts, null, 1));
for (const [k, v] of Object.entries(facts)) {
  console.log(k, `overflow=${v.overflow}`, `errors=${v.errors.length}`, `raw=${v.raw_status_in_sections.length}`);
}
fs.rmSync(bundle, { recursive: true, force: true });
if (failed) {
  console.error('mobile harness: FAILED');
  process.exit(1);
}
console.log('mobile harness: ok ->', outDir);
