// Vehicle detail Shipment / Test checklist panels after migration 0036,
// against an API on a *_test database (never the live DB).
// Env: BASE (vite), API (backend), EMAIL / PASSWORD (seed user of the test DB), VIN.
import { chromium } from '../../../web/node_modules/playwright/index.mjs';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { scriptOutputDir } from '../lib/output-dir.mjs';

const OUT = scriptOutputDir(import.meta.url);
const BASE = process.env.BASE ?? 'http://localhost:5175';
const API = process.env.API ?? 'http://localhost:18081/api/v1';
const VIN = process.env.VIN ?? 'N7V1K1SA1TK000009';

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
  const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
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

// Section headings and the item numbers listed under each, in screen order.
function groups() {
  const list = document.querySelector('[data-checklist-active-list]');
  return [...list.children].map((li) => ({
    title: li.querySelector(':scope > p')?.textContent ?? null,
    items: [...li.querySelectorAll('[data-checklist-active-item]')].map((row) =>
      Number.parseInt(row.innerText.trim(), 10),
    ),
  }));
}

for (const [locale, width] of [['tr', 1280], ['en', 1280], ['tr', 390]]) {
  for (const tab of ['shipment', 'test']) {
    if (tab === 'test' && locale !== 'tr') continue;
    const page = await open(locale, width);
    await page.goto(`${BASE}/vehicles/${VIN}?tab=${tab}`, { waitUntil: 'networkidle' });
    await page.locator('[data-checklist-active-list]').first().waitFor({ timeout: 15000 });
    await page.waitForTimeout(500);
    const key = `${tab}-${locale}-${width}`;
    facts[key] = await page.evaluate(groups);
    // Tall panel: grow the viewport to the whole page, then crop to the panel.
    // The app scrolls inside its own container, not the document.
    const height = await page.evaluate(() =>
      Math.max(...[...document.querySelectorAll('main, div')].map((d) => d.scrollHeight), 900) + 200,
    );
    await page.setViewportSize({ width, height: Math.min(height, 12000) });
    await page.waitForTimeout(300);
    const box = await page.locator('[data-checklist-active-total]').first().boundingBox();
    await page.screenshot({ path: path.join(OUT, `web-${key}.png`), clip: box });
    await page.context().close();
  }
}

fs.writeFileSync(path.join(OUT, 'web-facts.json'), JSON.stringify(facts, null, 1));
for (const [k, v] of Object.entries(facts)) {
  const order = v.flatMap((g) => g.items);
  console.log(k, v.map((g) => `${g.title} (${g.items[0]}-${g.items[g.items.length - 1]})`).join(' | '));
  console.log(`  first item #${order[0]}; order 1..${order.length} intact: ${order.every((n, i) => n === i + 1)}`);
}
await browser.close();
