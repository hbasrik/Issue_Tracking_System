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
  if (!res.ok) throw new Error(`login ${res.status} ${await res.text()}`);
  return res.json();
}

const session = await apiLogin();
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await context.addInitScript(
  ({ key, data }) => {
    localStorage.setItem(key, JSON.stringify(data));
    localStorage.setItem('karea-theme-mode', 'light');
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
await page.goto(`${BASE}/templates`, { waitUntil: 'networkidle' });
await page.getByRole('heading', { name: /şablon|template/i }).first().waitFor({ timeout: 15000 });
await page.waitForTimeout(1000);
await page.screenshot({
  path: path.join(OUT, 'templates-type-column.png'),
  fullPage: true,
});
console.log('wrote templates-type-column.png');
await browser.close();
