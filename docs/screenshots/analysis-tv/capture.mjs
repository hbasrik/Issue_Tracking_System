/**
 * Capture Analysis page after TV layout revision (light + dark, TR).
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
  await page.waitForTimeout(1500);
  // Confirm last-updated stamp exists
  const stamp = await page.locator('text=Son güncelleme').first().textContent();
  console.log(theme, 'stamp', stamp);
  // Confirm FPY-by-station chart title is gone
  const fpyGone = (await page.locator('text=İstasyon — ilk seferde doğru').count()) === 0;
  console.log(theme, 'fpyGone', fpyGone);
  // Confirm shipped list near top: first chart-ish heading after KPI
  await page.screenshot({
    path: path.join(OUT, `analysis-tv-${theme}-tr.png`),
    fullPage: true,
  });
  // Top viewport for TV wall composition
  await page.screenshot({
    path: path.join(OUT, `analysis-tv-${theme}-tr-viewport.png`),
    fullPage: false,
  });
  await context.close();
}

await shot('light');
await shot('dark');
await browser.close();
console.log('done');
