/**
 * Issue card visual separation + compact height proof (web @ 390px).
 * Uses live Issues board; Rule 7 — read-only.
 */
import { chromium } from '../../../web/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  contrastRatio,
  lightSurfaces,
} from '../../../shared/surfaces.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = __dirname;
const BASE = 'http://localhost:5173';
const API = 'http://127.0.0.1:8080/api/v1';
const AUTH_KEY = 'karea.auth.session';

fs.mkdirSync(OUT, { recursive: true });

const login = await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'manager@karea.local',
    password: 'changeme123',
  }),
}).then((r) => {
  if (!r.ok) throw new Error(`login ${r.status}`);
  return r.json();
});

const contrast = {
  border_on_card: Number(
    contrastRatio(lightSurfaces.border, lightSurfaces.bgSurface1).toFixed(2),
  ),
  border_on_page: Number(
    contrastRatio(lightSurfaces.border, lightSurfaces.bgPage).toFixed(2),
  ),
  card_on_page: Number(
    contrastRatio(lightSurfaces.bgSurface1, lightSurfaces.bgPage).toFixed(2),
  ),
  border: lightSurfaces.border,
  bgPage: lightSurfaces.bgPage,
  bgSurface1: lightSurfaces.bgSurface1,
};

fs.writeFileSync(path.join(OUT, 'contrast.json'), JSON.stringify(contrast, null, 2));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
  key: AUTH_KEY,
  value: {
    token: login.token,
    user: login.user,
    permissions: login.permissions,
  },
});
await page.goto(`${BASE}/issues`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('article.rounded-xl.border', { timeout: 60000 });
await page.waitForTimeout(800);

const cards = page.locator('article.rounded-xl.border');
const n = await cards.count();
if (n < 1) throw new Error('no issue cards');

const first = cards.first();
await first.scrollIntoViewIfNeeded();
await page.screenshot({ path: path.join(OUT, 'issues-compact-full.png') });
await first.screenshot({ path: path.join(OUT, 'issues-compact-card.png') });

const metrics = await first.evaluate((el) => {
  const s = getComputedStyle(el);
  const pageBg = getComputedStyle(document.documentElement).getPropertyValue('--bg-page').trim();
  const surface = getComputedStyle(document.documentElement).getPropertyValue('--bg-surface-1').trim();
  const border = getComputedStyle(document.documentElement).getPropertyValue('--border').trim();
  const r = el.getBoundingClientRect();
  const bottoms = [...el.children].map((c) => c.getBoundingClientRect().bottom - r.top);
  const contentBottom = Math.max(0, ...bottoms);
  return {
    height: Math.round(r.height),
    slackBelowContentPx: Math.round(r.height - contentBottom),
    borderColor: s.borderTopColor,
    backgroundColor: s.backgroundColor,
    cssVars: { pageBg, surface, border },
  };
});

fs.writeFileSync(
  path.join(OUT, 'proof.json'),
  JSON.stringify({ contrast, card: metrics, cards: n }, null, 2),
);
console.log('proof', { contrast, card: metrics, cards: n });

{
  const mpage = await browser.newPage({ viewport: { width: 390, height: 640 } });
  await mpage.setContent(`<!doctype html><html><head><meta charset="utf-8"/>
<style>
  body{margin:0;background:${lightSurfaces.bgPage};font-family:-apple-system,system-ui,sans-serif;padding:16px}
  .card{background:${lightSurfaces.bgSurface1};border:1px solid ${lightSurfaces.border};border-radius:12px;padding:12px;margin-top:12px}
  .row{display:flex;gap:12px;align-items:flex-start}
  .ph{width:64px;height:64px;border-radius:8px;background:${lightSurfaces.bgSurface2};flex-shrink:0}
  .t{font-weight:600;font-size:14px;color:${lightSurfaces.textPrimary};margin:0}
  .s{font-size:12px;color:${lightSurfaces.textSecondary};margin:4px 0 0}
  .meta{font-size:12px;color:${lightSurfaces.textSecondary};margin-top:6px}
</style></head><body>
  <div class="card"><div class="row"><div class="ph"></div><div><p class="t">Kısa açıklama</p><p class="s">Parça · tip</p><p class="meta">…00011 · 5g · Açık</p></div></div></div>
  <div class="card"><div class="row"><div class="ph"></div><div><p class="t">İki satırlık biraz daha uzun bir açıklama metni</p><p class="s">Bağlantı elemanı · Eksik</p><p class="meta">…00057 · 1g · İşlemde</p></div></div></div>
</body></html>`);
  await mpage.screenshot({ path: path.join(OUT, 'mobile-card-surfaces.png') });
  console.log('wrote mobile-card-surfaces.png');
  await mpage.close();
}

await browser.close();
