// Captures the vehicle-progress label and the collapsed "stage complete"
// checklist section against a *_test database API (never the live DB).
// Env: BASE (vite), API (backend), EMAIL / PASSWORD (a temp test user).
import { chromium } from '../../../web/node_modules/playwright/index.mjs';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const OUT = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE ?? 'http://localhost:5199';
const API = process.env.API ?? 'http://localhost:18082/api/v1';
const PASSED = process.env.PASSED_VIN ?? 'N7V1K1SA3TK000013';
const DELIVERED = process.env.DELIVERED_VIN ?? 'N7V1K1SA9TK000016';
const LINE = process.env.LINE_VIN ?? 'N7V1K1SA1TK000009';
const BRANCH_SHIPPED = process.env.BRANCH_SHIPPED_VIN ?? 'N7V1K1SA1TK000012';

const res = await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: process.env.EMAIL, password: process.env.PASSWORD }),
});
if (!res.ok) throw new Error(`login ${res.status} ${await res.text()}`);
const session = await res.json();

const browser = await chromium.launch({ headless: true });
const facts = {};

async function open(locale, width) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  await context.addInitScript(
    ({ data, locale }) => {
      localStorage.setItem('karea.auth.session', JSON.stringify(data));
      localStorage.setItem('karea-theme-mode', 'light');
      localStorage.setItem('karea-locale', locale);
    },
    { data: { token: session.token, user: session.user, permissions: session.permissions }, locale },
  );
  return context.newPage();
}

async function panelFacts(page) {
  return page.$$eval('[data-checklist-active-total]', (panels) =>
    panels.map((p) => ({
      title: p.querySelector('h2')?.textContent,
      header: p.querySelector('h2 + div p')?.textContent,
      active_total: p.getAttribute('data-checklist-active-total'),
      active_remaining: p.getAttribute('data-checklist-active-remaining'),
      stage_closed_count: p.getAttribute('data-checklist-stage-closed-count'),
      active_item_ids: [...p.querySelectorAll('[data-checklist-active-item]')].map((li) => li.getAttribute('data-checklist-active-item')),
      stage_closed_section: (() => {
        const d = p.querySelector('[data-checklist-stage-closed-section]');
        if (!d) return null;
        return {
          summary: d.querySelector('summary')?.textContent,
          open: d.open,
          item_ids: [...d.querySelectorAll('[data-checklist-stage-closed-item]')].map((li) => li.getAttribute('data-checklist-stage-closed-item')),
          buttons_inside: d.querySelectorAll('ul button, ul input, ul select, ul textarea, ul a').length,
        };
      })(),
      warnings: [...document.querySelectorAll('[role="alert"]')].map((a) => a.textContent),
    })),
  );
}

async function progressFacts(page) {
  return page.$eval('[data-vehicle-progress]', (f) => ({
    caption: f.querySelector('figcaption')?.innerText,
    aria: f.querySelector('[aria-label]')?.getAttribute('aria-label'),
    ring_text: f.innerText.split('\n')[0],
  }));
}

for (const [locale, width] of [['tr', 1280], ['en', 1280], ['tr', 390]]) {
  const page = await open(locale, width);
  await page.goto(`${BASE}/vehicles/${LINE}`, { waitUntil: 'networkidle' });
  const fig = page.locator('[data-vehicle-progress]');
  await fig.waitFor({ timeout: 15000 });
  facts[`progress_${locale}_${width}`] = await progressFacts(page);
  await fig.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(OUT, `progress-detail-${locale}-${width}.png`) });
  if (width === 1280) {
    await page.goto(`${BASE}/vehicles`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    facts[`list_headers_${locale}`] = await page.$$eval('th', (ths) => ths.map((t) => t.textContent.trim()));
    await page.screenshot({ path: path.join(OUT, `progress-list-${locale}.png`) });
  }
  await page.context().close();
}

const page = await open('tr', 1280);

async function tab(vin, name) {
  await page.goto(`${BASE}/vehicles/${vin}?tab=${name}`, { waitUntil: 'networkidle' });
  await page.locator('[data-checklist-active-total]').first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(500);
}

await tab(PASSED, 'shipment');
facts.passed_shipment_collapsed = await panelFacts(page);
await page.locator('[data-checklist-stage-closed-section]').first().scrollIntoViewIfNeeded();
await page.locator('[data-checklist-stage-closed-section]').first().screenshot({ path: path.join(OUT, 'passed-shipment-collapsed.png') });
await page.locator('[data-checklist-stage-closed-section] summary').first().click();
facts.passed_shipment_expanded = await panelFacts(page);
await page.locator('[data-checklist-stage-closed-section]').first().screenshot({ path: path.join(OUT, 'passed-shipment-expanded.png') });
await page.locator('[data-checklist-stage-closed-section] summary').first().click();
await page.screenshot({ path: path.join(OUT, 'passed-shipment-list-end.png') });

await tab(PASSED, 'eol');
facts.passed_eol = await panelFacts(page);

await tab(BRANCH_SHIPPED, 'eol');
facts.branch_shipped_eol = await panelFacts(page);
facts.branch_shipped_eol_depot_locked_hint = await page.locator('[data-checklist-active-total]').nth(1).locator('[role="status"]').allTextContents();
await page.locator('[data-checklist-stage-closed-section]').first().screenshot({ path: path.join(OUT, 'branch-shipped-eol-branch-collapsed.png') });
const depot = page.locator('[data-checklist-active-total]').nth(1);
await depot.scrollIntoViewIfNeeded();
await page.screenshot({ path: path.join(OUT, 'branch-shipped-eol-depot-unlocked.png') });

await tab(DELIVERED, 'shipment');
facts.delivered_shipment = await panelFacts(page);
await page.locator('[data-checklist-stage-closed-section]').first().screenshot({ path: path.join(OUT, 'delivered-shipment-collapsed.png') });

await tab(LINE, 'shipment');
facts.line_shipment = await panelFacts(page);
const tmp = page.locator('[data-checklist-active-item]', { hasText: 'TMP verify' }).first();
await tmp.scrollIntoViewIfNeeded();
await page.screenshot({ path: path.join(OUT, 'line-shipment-item-in-list.png') });

await tab(LINE, 'eol');
facts.line_eol = await panelFacts(page);

fs.writeFileSync(path.join(OUT, 'dom-facts.json'), JSON.stringify(facts, null, 1));
console.log("wrote", Object.keys(facts).join(", "));
await browser.close();
