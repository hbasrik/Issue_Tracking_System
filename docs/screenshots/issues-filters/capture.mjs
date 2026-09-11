import { chromium } from '../../../web/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = __dirname;
const BASE = 'http://localhost:5173';
const API = 'http://localhost:8080/api/v1';
const AUTH_KEY = 'karea.auth.session';

fs.mkdirSync(OUT, { recursive: true });

async function apiLogin() {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'manager@karea.local',
      password: 'changeme123',
    }),
  });
  if (!res.ok) throw new Error(`login ${res.status}`);
  return res.json();
}

function filterCard(page) {
  return page.locator('section').locator('div.rounded-xl.border').filter({
    has: page.getByText('VIN / bildiren'),
  }).first();
}

async function shot(page, name) {
  const card = filterCard(page);
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await card.screenshot({ path: path.join(OUT, name) });
  console.log('wrote', name);
}

async function setTheme(page, mode) {
  await page.evaluate((m) => {
    localStorage.setItem('karea-theme-mode', m);
  }, mode);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
}

async function runViewport(browser, session, width, height, prefix) {
  const context = await browser.newContext({ viewport: { width, height } });
  await context.addInitScript(
    ({ key, data }) => {
      localStorage.setItem(key, JSON.stringify(data));
      localStorage.setItem('karea-theme-mode', 'light');
      localStorage.setItem('karea-locale', 'tr');
      localStorage.setItem('karea-issues-advanced-filters-open', '0');
    },
    {
      key: AUTH_KEY,
      data: {
        token: session.token,
        user: session.user,
        permissions: session.permissions,
      },
    },
  );
  const page = await context.newPage();
  await page.goto(`${BASE}/issues`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);

  // Collapse default: open advanced, pick zone + type so count shows when closed
  await page.getByRole('button', { name: /Gelişmiş filtreler/i }).click();
  await page.waitForTimeout(300);
  // type chip + zone chip
  const advanced = page.getByText('Gelişmiş filtreler').locator('..').locator('..');
  // Click first issue type and first zone if present
  const typeLabel = page.getByText(/^Tür$|^Type$/).first();
  await typeLabel.scrollIntoViewIfNeeded();
  const typeRow = typeLabel.locator('xpath=following-sibling::*[1]');
  const typeBtn = typeRow.locator('button').first();
  if (await typeBtn.count()) await typeBtn.click();
  const zoneLabel = page.getByText(/^Bölge$/).first();
  const zoneRow = zoneLabel.locator('xpath=following-sibling::*[1]');
  const zoneBtn = zoneRow.locator('button').first();
  if (await zoneBtn.count()) await zoneBtn.click();

  // Part multi-select
  await page.getByRole('button', { name: /Parça seç/i }).click();
  await page.waitForTimeout(200);
  const option = page.getByRole('option').first();
  if (await option.count()) await option.click();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await shot(page, `${prefix}-advanced-open-light.png`);

  // Close advanced — expect count in title
  await page.getByRole('button', { name: /Gelişmiş filtreler/i }).click();
  await page.waitForTimeout(300);
  const title = await page.getByRole('button', { name: /Gelişmiş filtreler/i }).innerText();
  console.log(prefix, 'collapsed title:', JSON.stringify(title));
  await shot(page, `${prefix}-collapsed-light.png`);

  await setTheme(page, 'dark');
  // Re-apply filters after reload wiped? localStorage keeps advanced closed but filter state is React state — lost on reload.
  // Capture collapsed empty dark, then reopen and select again.
  await page.getByRole('button', { name: /Gelişmiş filtreler/i }).click();
  await page.waitForTimeout(200);
  const typeBtn2 = page.getByText(/^Tür$|^Type$/).first().locator('xpath=following-sibling::*[1]').locator('button').first();
  if (await typeBtn2.count()) await typeBtn2.click();
  const zoneBtn2 = page.getByText(/^Bölge$/).first().locator('xpath=following-sibling::*[1]').locator('button').first();
  if (await zoneBtn2.count()) await zoneBtn2.click();
  await page.getByRole('button', { name: /Parça seç/i }).click();
  const option2 = page.getByRole('option').first();
  if (await option2.count()) await option2.click();
  await page.keyboard.press('Escape');
  await shot(page, `${prefix}-advanced-open-dark.png`);
  await page.getByRole('button', { name: /Gelişmiş filtreler/i }).click();
  await page.waitForTimeout(200);
  await shot(page, `${prefix}-collapsed-dark.png`);

  // Overflow check: filter card bounding vs children
  const overflow = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('div.rounded-xl.border')];
    const card = cards.find((c) => c.textContent?.includes('VIN / bildiren'));
    if (!card) return { ok: false, reason: 'card not found' };
    const cr = card.getBoundingClientRect();
    const bad = [];
    for (const el of card.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right > cr.right + 1 || r.left < cr.left - 1) {
        bad.push({
          tag: el.tagName,
          text: (el.textContent || '').slice(0, 40),
          right: r.right,
          cardRight: cr.right,
        });
      }
    }
    return { ok: bad.length === 0, overflows: bad.slice(0, 8), cardWidth: cr.width };
  });
  console.log(prefix, 'overflow', JSON.stringify(overflow));

  await context.close();
  return overflow;
}

const session = await apiLogin();
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const wide = await runViewport(browser, session, 1440, 900, 'wide');
const narrow = await runViewport(browser, session, 390, 844, 'narrow');
await browser.close();
if (!wide.ok || !narrow.ok) {
  console.error('OVERFLOW DETECTED');
  process.exit(1);
}
console.log('all ok');
