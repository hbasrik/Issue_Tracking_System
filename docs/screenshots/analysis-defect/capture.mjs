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
      password: 'TourDVerify1!',
    }),
  });
  if (!res.ok) throw new Error(`login ${res.status} ${await res.text()}`);
  return res.json();
}

fs.mkdirSync(OUT, { recursive: true });
const session = await apiLogin();
const browser = await chromium.launch({ headless: true, channel: 'chrome' });

async function shot(theme, query, name) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
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
  await page.goto(`${BASE}/analysis${query}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  // Scroll to defect section
  const heading = page.getByText('Hata sınıflandırması', { exact: true }).first();
  await heading.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await page.screenshot({
    path: path.join(OUT, `${name}-${theme}.png`),
    fullPage: false,
  });
  // empty-ish: also full page once for light filled
  if (theme === 'light' && name === 'defect-filled') {
    await page.screenshot({
      path: path.join(OUT, `defect-filled-light-full.png`),
      fullPage: true,
    });
  }
  const count = await page.getByText('Veri yok').count();
  console.log(theme, name, 'emptyChartCount', count);
  await context.close();
}

await shot('light', '?from=2026-09-01&to=2026-09-11', 'defect-filled');
await shot('dark', '?from=2026-09-01&to=2026-09-11', 'defect-filled');
// Far-future window → mostly empty defect charts
await shot('light', '?from=2099-01-01&to=2099-01-31', 'defect-empty');
await browser.close();
console.log('done');
