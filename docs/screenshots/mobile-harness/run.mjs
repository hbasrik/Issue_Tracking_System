/**
 * Renders real mobile screens (react-native-web) and screenshots them at
 * phone widths. Scenes live in scenes.ts; data comes from stubs, no backend.
 *
 * Usage (from mobile/):  npm run screenshots -- <outDir> [scene,scene] [--locales tr,en]
 *   or: node docs/screenshots/mobile-harness/run.mjs <outDir> ...
 * Writes <scene>-<locale>-<width>[-open].png and facts.json into <outDir>
 * (an <outDir> under docs/screenshots/ goes to $TMPDIR/karea-shots/ unless
 * UPDATE_SCREENSHOTS=1, see ../lib/output-dir.mjs);
 * with CARD_TEXT=<text> also a crop of the issue card containing that text.
 * EXPECT_ISSUE_LAYOUT=1 fails on visible severity text or a card whose
 * status/severity/meta corners do not match.
 * Exits non-zero on page errors, horizontal overflow or raw status text in
 * the collapsed checklist sections.
 */
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { build } from './build.mjs';
import { chromium } from '../../../web/node_modules/playwright/index.mjs';
import { outputDir } from '../lib/output-dir.mjs';

const TOGGLES = ['checklist-stage-closed-toggle', 'checklist-inactive-toggle'];
const RAW_STATUS = /\b(PENDING|NOT_OK|CONDITIONAL_OK)\b/;

const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1].split(',') : null;
};
const locales = option('--locales') ?? ['tr'];
const WIDTHS = (option('--widths') ?? ['375', '390', '430']).map(Number);
const positional = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
if (!positional[0]) throw new Error('usage: run.mjs <outDir> [scene,scene] [--locales tr,en] [--widths 375,1280]');
const outDir = outputDir(positional[0]);
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

// Runs in the page: layout facts for every IssueCard on screen.
function issueCardFacts() {
  const rect = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: r.top, right: r.right, bottom: r.bottom, left: r.left };
  };
  const cards = [...document.querySelectorAll('[data-testid="issue-card-photo"]')]
    .map((p) => p.closest('[role="button"]'))
    .filter(Boolean);
  return cards.map((card) => {
    const box = card.getBoundingClientRect();
    const sev = card.querySelector('[role="img"][aria-label]');
    const status = rect(card.querySelector('[data-testid="issue-card-status"]'));
    const bars = rect(sev);
    const meta = rect(card.querySelector('[data-testid="issue-card-meta"]'));
    const outside = [...card.querySelectorAll('div,span')].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 &&
        (r.right > box.right + 1 || r.left < box.left - 1 || r.bottom > box.bottom + 1 || r.top < box.top - 1);
    }).length;
    // Grid cards start the text body under the photo.
    const photo = card.querySelector('[data-testid="issue-card-photo"]').getBoundingClientRect();
    const bodyTop = photo.right < box.right - 1 ? box.top : photo.bottom;
    const layout = status && bars && meta
      ? {
          status_top_right: status.top - bodyTop <= 16 && status.right >= meta.right - 1,
          severity_below_status: bars.top >= status.bottom - 0.5 && bars.top - status.bottom <= 12,
          severity_right_aligned: Math.abs(bars.right - status.right) <= 1.5,
          meta_bottom_left: meta.left < status.left && meta.top > status.bottom,
        }
      : null;
    return {
      text: card.innerText,
      severity_word_visible: /\b(Kritik|Orta|Düşük|Critical|Medium|Low)\b/.test(card.innerText),
      severity_aria: sev ? sev.getAttribute('aria-label') : null,
      card_aria: card.getAttribute('aria-label'),
      outside,
      box: rect(card),
      body_top: bodyTop,
      status,
      bars,
      meta,
      layout,
    };
  });
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
      const issueCards = await page.evaluate(issueCardFacts);
      if (process.env.CARD_TEXT && issueCards.length) {
        await page
          .locator('[role="button"]', { has: page.locator('[data-testid="issue-card-photo"]'), hasText: process.env.CARD_TEXT })
          .first()
          .screenshot({ path: path.join(outDir, `${key}-card.png`) });
      }
      const bodyLines = () => document.body.innerText.split('\n').map((l) => l.trim()).filter(Boolean);
      const lines = await page.evaluate(bodyLines);
      // CLICK_TESTIDS=a,b clicks each testID in turn (first match) and shoots <key>-<testID>.png.
      const clicked = {};
      for (const id of (process.env.CLICK_TESTIDS ?? '').split(',').filter(Boolean)) {
        const target = page.locator(`[data-testid="${id}"]`).first();
        if (!(await target.count())) continue;
        await target.click();
        await page.waitForTimeout(250);
        await fitAndShoot(page, width, `${key}-${id}.png`);
        clicked[id] = await page.evaluate(bodyLines);
      }
      facts[key] = { sections: texts, overflow, raw_status_in_sections: raw, issue_cards: issueCards, errors, calls: await page.evaluate(() => window.__calls), lines, clicked };
      if (errors.length || overflow || raw.length) failed = true;
      if (process.env.EXPECT_ISSUE_LAYOUT === '1' && issueCards.some((c) =>
        c.severity_word_visible || !c.severity_aria || c.outside ||
        !c.layout || Object.values(c.layout).includes(false))) failed = true;
      await page.close();
    }
  }
}

await browser.close();
fs.writeFileSync(path.join(outDir, 'facts.json'), JSON.stringify(facts, null, 1));
for (const [k, v] of Object.entries(facts)) {
  const cards = v.issue_cards.length
    ? ` cards=${v.issue_cards.length} sevText=${v.issue_cards.filter((c) => c.severity_word_visible).length}` +
      ` aria=${v.issue_cards.map((c) => c.severity_aria).join('|')}` +
      ` layoutOk=${v.issue_cards.filter((c) => c.layout && !Object.values(c.layout).includes(false)).length}` +
      ` cardOverflow=${v.issue_cards.reduce((n, c) => n + c.outside, 0)}`
    : '';
  console.log(k, `overflow=${v.overflow}`, `errors=${v.errors.length}`, `raw=${v.raw_status_in_sections.length}${cards}`);
}
fs.rmSync(bundle, { recursive: true, force: true });
if (failed) {
  console.error('mobile harness: FAILED');
  process.exit(1);
}
console.log('mobile harness: ok ->', outDir);
