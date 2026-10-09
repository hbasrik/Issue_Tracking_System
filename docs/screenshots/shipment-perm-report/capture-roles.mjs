// Read-only: how the two Shipment checklist permissions look on the Roles
// page today. Test API :18081 / web :5175 on a *_test database (never the
// live DB, never :8080). Nothing is saved; the script only scrolls and shoots.
import path from 'path';
import { chromium } from '../../../web/node_modules/playwright/index.mjs';
import { scriptOutputDir } from '../lib/output-dir.mjs';

const OUT = scriptOutputDir(import.meta.url);
const BASE = 'http://localhost:5175';
const API = 'http://localhost:18081/api/v1';
const ROW = /Shipment checklist/;

const session = await (
  await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'manager@karea.local', password: 'changeme123' }),
  })
).json();
if (!session.token) throw new Error('login on the test API failed');

const browser = await chromium.launch({ headless: true });
for (const locale of ['tr', 'en']) {
  for (const [width, height] of [[1280, 900], [375, 812]]) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
    await context.addInitScript(
      (data) => {
        localStorage.setItem('karea.auth.session', JSON.stringify(data.session));
        localStorage.setItem('karea-theme-mode', 'light');
        localStorage.setItem('karea-locale', data.locale);
      },
      { session: { token: session.token, user: session.user, permissions: session.permissions }, locale },
    );
    const page = await context.newPage();
    await page.goto(`${BASE}/roles`, { waitUntil: 'networkidle' });
    const row = page.locator('tr', { hasText: ROW }).first();
    await row.waitFor({ timeout: 15000 });
    const rows = await page.locator('tr', { hasText: ROW }).evaluateAll((trs) =>
      trs.map((tr) => ({
        label: tr.querySelector('th, td')?.textContent?.trim(),
        checked: [...tr.querySelectorAll('input[type="checkbox"]')].map((c) => c.checked),
      })),
    );
    const headers = await page.locator('thead th').allInnerTexts();
    console.log(`== ${locale} ${width} ==  columns: ${headers.map((h) => h.trim()).join(' | ')}`);
    for (const r of rows) console.log(`  ${r.label}: ${JSON.stringify(r.checked)}`);
    await row.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await page.screenshot({ path: path.join(OUT, `roles-${locale}-${width}.png`) });
    await context.close();
  }
}
await browser.close();
