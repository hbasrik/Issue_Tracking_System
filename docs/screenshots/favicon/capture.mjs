/**
 * Capture favicon tab chrome mock + size clarity strip.
 * Requires web/vite on :5173.
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
  if (!res.ok) throw new Error(`login ${res.status} ${await res.text()}`);
  return res.json();
}

fs.mkdirSync(OUT, { recursive: true });
const session = await apiLogin();

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
});
const context = await browser.newContext({ viewport: { width: 1100, height: 700 } });
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
await page.goto(BASE + '/', { waitUntil: 'networkidle' });
await page.waitForTimeout(600);

const meta = await page.evaluate(() => ({
  title: document.title,
  icons: [...document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]')].map(
    (el) => ({
      rel: el.getAttribute('rel'),
      sizes: el.getAttribute('sizes'),
      href: el.getAttribute('href'),
      type: el.getAttribute('type'),
    }),
  ),
}));
console.log(JSON.stringify(meta, null, 2));
if (meta.title !== 'Karea') throw new Error(`unexpected title: ${meta.title}`);

await page.screenshot({ path: path.join(OUT, 'app-with-title.png'), fullPage: false });

// Favicon size strip + mock browser tab (real assets)
const verify = await context.newPage();
await verify.setContent(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Karea</title>
<link rel="icon" href="${BASE}/favicon.ico" sizes="any" />
<link rel="icon" type="image/png" sizes="32x32" href="${BASE}/favicon-32x32.png" />
<link rel="icon" type="image/png" sizes="16x16" href="${BASE}/favicon-16x16.png" />
<style>
  body { margin: 0; font-family: system-ui, sans-serif; background: #e8e8e8; }
  .chrome { background: #dee1e6; padding: 10px 12px 0; }
  .tabs { display: flex; gap: 4px; align-items: flex-end; }
  .tab {
    display: flex; align-items: center; gap: 8px;
    background: #fff; border-radius: 8px 8px 0 0;
    padding: 8px 14px; font-size: 13px; color: #202124;
    box-shadow: 0 -1px 0 #fff inset; min-width: 180px;
  }
  .tab img { width: 16px; height: 16px; }
  .inactive { background: #cfd2d8; opacity: 0.85; }
  .bar { background: #fff; height: 40px; border-bottom: 1px solid #dadce0; }
  .panel { padding: 28px; background: #f5f5f5; }
  h1 { font-size: 16px; margin: 0 0 16px; }
  .row { display: flex; gap: 28px; align-items: flex-end; flex-wrap: wrap; }
  .cell { text-align: center; }
  .cell span { display: block; margin-top: 8px; font-size: 12px; color: #444; }
  .on-light { background: #fff; padding: 12px; border-radius: 8px; border: 1px solid #ddd; }
  .on-dark { background: #1a1a1a; padding: 12px; border-radius: 8px; }
  .pair { display: flex; gap: 12px; }
</style></head><body>
  <div class="chrome">
    <div class="tabs">
      <div class="tab">
        <img src="${BASE}/favicon-16x16.png" alt="" />
        <span>Karea</span>
      </div>
      <div class="tab inactive">
        <img src="${BASE}/favicon-16x16.png" alt="" />
        <span>Other tab</span>
      </div>
    </div>
  </div>
  <div class="bar"></div>
  <div class="panel">
    <h1>Favicon sizes (black plate — white mark stays visible on light &amp; dark chrome)</h1>
    <div class="row">
      <div class="cell"><div class="on-light"><img src="${BASE}/favicon-16x16.png" width="16" height="16" style="image-rendering:pixelated" /></div><span>16×16</span></div>
      <div class="cell"><div class="on-light"><img src="${BASE}/favicon-32x32.png" width="32" height="32" style="image-rendering:pixelated" /></div><span>32×32</span></div>
      <div class="cell"><div class="on-light"><img src="${BASE}/apple-touch-icon.png" width="90" height="90" /></div><span>apple-touch 180 (shown 90)</span></div>
      <div class="cell"><div class="pair">
        <div class="on-light"><img src="${BASE}/favicon-32x32.png" width="32" height="32" /></div>
        <div class="on-dark"><img src="${BASE}/favicon-32x32.png" width="32" height="32" /></div>
      </div><span>32 on light / dark</span></div>
    </div>
  </div>
</body></html>`, { waitUntil: 'networkidle' });
await verify.waitForTimeout(400);
await verify.screenshot({ path: path.join(OUT, 'favicon-tab-and-sizes.png'), fullPage: true });

console.log('wrote screenshots to', OUT);
await browser.close();
