/**
 * Capture favicon tab mock (light + dark chrome) and size zooms.
 * Requires web vite on :5173.
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

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1100, height: 780 } });
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
await page.waitForTimeout(400);
const meta = await page.evaluate(() => ({
  title: document.title,
  icons: [...document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]')].map(
    (el) => ({
      rel: el.getAttribute('rel'),
      sizes: el.getAttribute('sizes'),
      href: el.getAttribute('href'),
    }),
  ),
}));
console.log(JSON.stringify(meta, null, 2));
if (meta.title !== 'Karea') throw new Error(`unexpected title: ${meta.title}`);

const bust = Date.now();
const verify = await context.newPage();
await verify.setContent(
  `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Karea</title>
<style>
  body { margin: 0; font-family: system-ui, sans-serif; background: #d0d0d0; }
  section { margin-bottom: 20px; }
  h2 { font-size: 14px; margin: 0 0 8px; color: #333; }
  .chrome { padding: 10px 12px 0; }
  .chrome.light { background: #dee1e6; }
  .chrome.dark { background: #202124; }
  .tabs { display: flex; gap: 4px; align-items: flex-end; }
  .tab {
    display: flex; align-items: center; gap: 8px;
    border-radius: 8px 8px 0 0; padding: 8px 14px; font-size: 13px; min-width: 160px;
  }
  .chrome.light .tab { background: #fff; color: #202124; }
  .chrome.dark .tab { background: #3c4043; color: #e8eaed; }
  .tab img { width: 16px; height: 16px; }
  .bar.light { background: #fff; height: 28px; border-bottom: 1px solid #dadce0; }
  .bar.dark { background: #292a2d; height: 28px; border-bottom: 1px solid #3c4043; }
  .panel { padding: 20px 24px 28px; background: #f0f0f0; }
  .row { display: flex; gap: 32px; align-items: flex-end; flex-wrap: wrap; }
  .cell { text-align: center; }
  .cell span { display: block; margin-top: 8px; font-size: 12px; color: #444; }
  .zoom {
    image-rendering: pixelated;
    border: 1px solid #bbb;
    background: #fff;
  }
</style></head><body>
  <section>
    <h2 style="padding:12px 12px 0">Light browser chrome</h2>
    <div class="chrome light">
      <div class="tabs">
        <div class="tab">
          <img src="${BASE}/favicon-16x16.png?v=${bust}" alt="" />
          <span>Karea</span>
        </div>
      </div>
    </div>
    <div class="bar light"></div>
  </section>
  <section>
    <h2 style="padding:12px 12px 0;color:#eee;background:#111;margin:0">Dark browser chrome</h2>
    <div class="chrome dark">
      <div class="tabs">
        <div class="tab">
          <img src="${BASE}/favicon-16x16.png?v=${bust}" alt="" />
          <span>Karea</span>
        </div>
      </div>
    </div>
    <div class="bar dark"></div>
  </section>
  <div class="panel">
    <h2>Zoomed pixel previews (12×)</h2>
    <div class="row">
      <div class="cell">
        <img class="zoom" src="${BASE}/favicon-16x16.png?v=${bust}" width="192" height="192" />
        <span>16×16 → 192</span>
      </div>
      <div class="cell">
        <img class="zoom" src="${BASE}/favicon-32x32.png?v=${bust}" width="192" height="192" />
        <span>32×32 → 192</span>
      </div>
      <div class="cell">
        <img src="${BASE}/apple-touch-icon.png?v=${bust}" width="90" height="90" />
        <span>apple-touch 180</span>
      </div>
    </div>
  </div>
</body></html>`,
  { waitUntil: 'networkidle' },
);
await verify.waitForTimeout(500);
await verify.screenshot({ path: path.join(OUT, 'favicon-tab-and-sizes.png'), fullPage: true });
console.log('wrote', path.join(OUT, 'favicon-tab-and-sizes.png'));
await browser.close();
