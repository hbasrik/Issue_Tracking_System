/**
 * Capture Analysis page after MTTR/layout/fabrika fixes (light + dark, TR).
 */
import { chromium } from '/Users/Basri/Desktop/kts_kms_project/web/node_modules/playwright/index.mjs';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = __dirname;
const BASE = 'http://localhost:5173';
const API = 'http://localhost:8080/api/v1';
const AUTH_KEY = 'karea.auth.session';

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

fs.mkdirSync(OUT, { recursive: true });
const session = await apiLogin();
const browser = await chromium.launch({ headless: true, channel: 'chrome' });

async function shot(theme) {
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  });
  await context.addInitScript(
    ({ key, data, theme }) => {
      localStorage.setItem(key, JSON.stringify(data));
      localStorage.setItem('karea-theme-mode', theme);
      localStorage.setItem('karea-locale', 'tr');
    },
    {
      key: AUTH_KEY,
      theme,
      data: {
        token: session.token,
        user: session.user,
        permissions: session.permissions,
      },
    },
  );
  const page = await context.newPage();
  await page.goto(`${BASE}/analysis`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const bodyText = await page.locator('body').innerText();
  const hasSube = /Şube|şube/.test(bodyText);
  const hasFabrika = /Fabrika/.test(bodyText);
  const filterY = await page.locator('[data-testid="analysis-filters"]').boundingBox();
  const shippedTitle = page.getByText('Fabrikadan sevk edilen araçlar').first();
  const stockTitle = page.getByText('Günlük açık stok').first();
  const shippedBox = await shippedTitle.boundingBox();
  const stockBox = await stockTitle.boundingBox();

  console.log(theme, {
    hasSube,
    hasFabrika,
    filterY: filterY?.y,
    shippedY: shippedBox?.y,
    stockY: stockBox?.y,
    sideBySide:
      shippedBox && stockBox
        ? Math.abs(shippedBox.y - stockBox.y) < 40 && shippedBox.x < stockBox.x
        : false,
  });

  // Top-of-page composition: KPI → filters → ops row
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  await page.screenshot({
    path: path.join(OUT, `layout-${theme}-tr-viewport.png`),
    fullPage: false,
  });
  await page.screenshot({
    path: path.join(OUT, `layout-${theme}-tr-full.png`),
    fullPage: true,
  });

  // Ops row (shipped + daily stock)
  await shippedTitle.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const opsRow = shippedTitle.locator('xpath=ancestor::*[contains(@class,"grid")][1]');
  if (await opsRow.count()) {
    await opsRow.screenshot({ path: path.join(OUT, `ops-row-${theme}-tr.png`) });
  }

  // MTTR card
  const mttrTitle = page.getByText('İstasyon Bazlı MTTR').first();
  await mttrTitle.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  const mttrCard = mttrTitle.locator('xpath=ancestor::*[contains(@class,"rounded")][1]');
  if (await mttrCard.count()) {
    await mttrCard.screenshot({ path: path.join(OUT, `mttr-${theme}-tr.png`) });
  }

  await context.close();
  return { hasSube, hasFabrika };
}

const light = await shot('light');
const dark = await shot('dark');
await browser.close();

if (light.hasSube || dark.hasSube) {
  console.error('FAIL: Şube still visible on analysis page');
  process.exit(1);
}
console.log('done');
