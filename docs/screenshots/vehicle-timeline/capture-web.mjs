// Vehicle detail → audit tab (vehicle timeline) against the test API on
// karea_timeline_test (never the live DB). Writes web-*.png + web-facts.json
// and scans the fully expanded timeline text for raw stored values.
// Env: BASE (vite), API (backend), EMAIL / PASSWORD (seed user), VIN.
import { chromium } from '../../../web/node_modules/playwright/index.mjs';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const OUT = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE ?? 'http://localhost:5175';
const API = process.env.API ?? 'http://localhost:18081/api/v1';
const VIN = process.env.VIN ?? 'N7V1K1SA6TK000006';
const RAW = [
  /\b[A-Z]{2,}(?:_[A-Z0-9]+)+\b/g, // IN_WAREHOUSE, CONDITIONAL_OK, STATUS_CHANGE
  /\b[a-z]+_[a-z_]+\b/g, // eol_branch_ship, place_on_hold, dev_reset
  /\btimeline\.[a-zA-Z.]+/g, // missing message key
  // Bare enum words; "OK" is the real English label, so it is not listed.
  /\b(PENDING|OPEN|DONE|APPROVED|BRANCH|DEPOT|COMPLETED|REWORK|DELIVERED)\b/g,
  // Every value in this data is known; the generic fallback must not appear.
  /Unknown value|Bilinmeyen değer/g,
];

const res = await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: process.env.EMAIL, password: process.env.PASSWORD }),
});
if (!res.ok) throw new Error(`login ${res.status} ${await res.text()}`);
const session = await res.json();

const browser = await chromium.launch({ headless: true });
const facts = {};
let failed = false;

async function open(locale, width) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
  await context.addInitScript(
    ({ data, locale }) => {
      localStorage.setItem('karea.auth.session', JSON.stringify(data));
      localStorage.setItem('karea-theme-mode', 'light');
      localStorage.setItem('karea-locale', locale);
    },
    { data: { token: session.token, user: session.user, permissions: session.permissions }, locale },
  );
  const page = await context.newPage();
  await page.goto(`${BASE}/vehicles/${VIN}?tab=audit`, { waitUntil: 'networkidle' });
  await page.locator('[data-testid="vehicle-timeline"] ol').first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(300);
  return page;
}

async function shoot(page, width, file) {
  const height = await page.evaluate(() =>
    Math.max(...[...document.querySelectorAll('main, div')].map((d) => d.scrollHeight), 900) + 200,
  );
  await page.setViewportSize({ width, height: Math.min(height, 14000) });
  await page.waitForTimeout(300);
  const box = await page.locator('[data-testid="vehicle-timeline"]').boundingBox();
  await page.screenshot({ path: path.join(OUT, file), clip: box });
}

const timelineText = (page) =>
  page.locator('[data-testid="vehicle-timeline"]').evaluate((el) =>
    el.innerText.split('\n').map((l) => l.trim()).filter(Boolean),
  );

const rowKinds = (page) =>
  page.evaluate(() => {
    const out = {};
    for (const li of document.querySelectorAll('[data-testid="vehicle-timeline"] > ol > li')) {
      const k = li.getAttribute('data-timeline-row');
      out[k] = (out[k] ?? 0) + 1;
    }
    return out;
  });

for (const [locale, width] of [['tr', 1280], ['en', 1280], ['tr', 390]]) {
  const key = `${locale}-${width}`;
  const page = await open(locale, width);
  await shoot(page, width, `web-${key}.png`);
  const collapsed = await timelineText(page);
  const kinds = await rowKinds(page);

  // Expand every folded checklist run, then scan the whole text.
  const toggles = page.locator('[data-testid="timeline-group-toggle"]');
  const groups = await toggles.count();
  for (let i = 0; i < groups; i += 1) await toggles.nth(i).click();
  await page.waitForTimeout(200);
  const expanded = await timelineText(page);
  const expandedRows = await page.locator('[data-testid="vehicle-timeline"] li').count();
  const raw = [...new Set(RAW.flatMap((re) => expanded.join('\n').match(re) ?? []))];
  if (raw.length) failed = true;

  if (key === 'tr-1280') {
    // Only the first group open: shows the folded run next to an expanded one.
    for (let i = 1; i < groups; i += 1) await toggles.nth(i).click();
    await page.waitForTimeout(200);
    await shoot(page, width, `web-${key}-expanded.png`);
    for (const f of ['status', 'checklist', 'issue']) {
      await page.locator(`[data-testid="timeline-filter-${f}"]`).click();
      await page.waitForTimeout(200);
      await shoot(page, width, `web-${key}-filter-${f}.png`);
      facts[`${key}-filter-${f}`] = { lines: await timelineText(page), row_kinds: await rowKinds(page) };
    }
  }
  facts[key] = {
    row_kinds_collapsed: kinds,
    groups,
    rows_with_groups_expanded: expandedRows,
    raw_values_found: raw,
    lines_collapsed: collapsed,
    lines_expanded: expanded,
  };
  console.log(
    `${key}: top-level rows ${JSON.stringify(kinds)}; groups ${groups}; ` +
      `rows with groups expanded ${expandedRows}; lines scanned ${expanded.length}; raw values ${raw.length ? raw.join(', ') : 'none'}`,
  );
  await page.context().close();
}

for (const f of ['status', 'checklist', 'issue']) {
  console.log(`tr-1280 filter ${f}: ${JSON.stringify(facts[`tr-1280-filter-${f}`].row_kinds)}`);
}
fs.writeFileSync(path.join(OUT, 'web-facts.json'), JSON.stringify(facts, null, 1));
await browser.close();
if (failed) {
  console.error('raw values found');
  process.exit(1);
}
