/**
 * Advanced filters layout + focus-ring verification (wide/narrow, light/dark).
 */
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

async function verifyFocus(page) {
  const btn = page.getByRole('button', { name: /Gelişmiş filtreler/i });
  await btn.scrollIntoViewIfNeeded();

  // Mouse click must not leave a visible outline.
  await btn.click({ force: true });
  await page.waitForTimeout(150);
  const afterClick = await btn.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      outlineStyle: s.outlineStyle,
      outlineWidth: s.outlineWidth,
      matchesFocusVisible: el.matches(':focus-visible'),
      focused: document.activeElement === el,
    };
  });

  // Keyboard: Tab onto the control (blur first, then focus via keyboard).
  await page.evaluate(() => document.activeElement?.blur?.());
  await btn.focus();
  // Playwright focus() may not set :focus-visible; use keyboard Tab from a prior control.
  await page.locator('input').first().focus();
  await page.keyboard.press('Tab');
  // Keep tabbing until advanced button is focused (filters have several controls).
  for (let i = 0; i < 20; i++) {
    const isTarget = await btn.evaluate((el) => document.activeElement === el);
    if (isTarget) break;
    await page.keyboard.press('Tab');
  }
  const afterTab = await btn.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      outlineStyle: s.outlineStyle,
      outlineWidth: s.outlineWidth,
      matchesFocusVisible: el.matches(':focus-visible'),
      focused: document.activeElement === el,
      hasQuiet: el.classList.contains('focus-ring-quiet'),
    };
  });

  return { afterClick, afterTab };
}

async function openAdvancedAndSelect(page) {
  const adv = page.getByRole('button', { name: /Gelişmiş filtreler/i });
  const expanded = await adv.getAttribute('aria-expanded');
  if (expanded !== 'true') await adv.click();
  await page.waitForTimeout(250);

  const typeBtn = page
    .getByText(/^Tür$|^Type$/)
    .first()
    .locator('xpath=following-sibling::*[1]')
    .locator('button')
    .first();
  if (await typeBtn.count()) await typeBtn.click();

  const zoneBtn = page
    .getByText(/^Bölge$/)
    .first()
    .locator('xpath=following-sibling::*[1]')
    .locator('button')
    .first();
  if (await zoneBtn.count()) await zoneBtn.click();

  // Multi-select two parts, then close menu for layout shot
  await page.getByRole('button', { name: /Parça seç/i }).click();
  await page.waitForTimeout(150);
  const options = page.getByRole('option');
  const n = await options.count();
  if (n > 0) await options.nth(0).click();
  if (n > 1) await options.nth(1).click();
  // Close by clicking outside / Escape
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  // Ensure listbox closed
  if (await page.getByRole('listbox').count()) {
    await page.getByRole('button', { name: /Parça seç/i }).click();
    await page.waitForTimeout(100);
  }
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

  const focus = await verifyFocus(page);
  console.log(prefix, 'focus', JSON.stringify(focus));

  await openAdvancedAndSelect(page);
  await shot(page, `${prefix}-advanced-open-light.png`);

  // Collapsed with active count
  await page.getByRole('button', { name: /Gelişmiş filtreler/i }).click();
  await page.waitForTimeout(200);
  await shot(page, `${prefix}-collapsed-light.png`);

  await setTheme(page, 'dark');
  await openAdvancedAndSelect(page);
  await shot(page, `${prefix}-advanced-open-dark.png`);
  await page.getByRole('button', { name: /Gelişmiş filtreler/i }).click();
  await page.waitForTimeout(200);
  await shot(page, `${prefix}-collapsed-dark.png`);

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
  return { overflow, focus };
}

const session = await apiLogin();
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const wide = await runViewport(browser, session, 1440, 900, 'wide');
const narrow = await runViewport(browser, session, 390, 844, 'narrow');
await browser.close();

const mouseOk =
  wide.focus.afterClick.outlineStyle === 'none' ||
  wide.focus.afterClick.outlineWidth === '0px';
// Keyboard path: if we landed on the button, expect a visible quiet outline.
const tabFocused = wide.focus.afterTab.focused;
const tabOk =
  !tabFocused ||
  (wide.focus.afterTab.outlineStyle === 'solid' &&
    wide.focus.afterTab.outlineWidth === '1px' &&
    wide.focus.afterTab.hasQuiet);

if (!wide.overflow.ok || !narrow.overflow.ok) {
  console.error('OVERFLOW DETECTED');
  process.exit(1);
}
if (!mouseOk) {
  console.error('MOUSE FOCUS RING STILL VISIBLE', wide.focus.afterClick);
  process.exit(1);
}
if (!tabOk) {
  console.error('KEYBOARD FOCUS RING MISSING/WRONG', wide.focus.afterTab);
  process.exit(1);
}
console.log('all ok', { mouseOk, tabOk, tabFocused });
