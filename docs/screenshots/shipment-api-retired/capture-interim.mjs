// Read-only: the web between the code change and migration 0045. The Roles
// page has no catalogue entry for checklist.shipment.* any more, so the two
// rows still in the database fall into the "other" group until 0045 deletes
// them; the Templates page lists only EOL and TEST. Test API :18081 / web
// :5175 on a *_test database (never the live DB, never :8080).
import path from 'path';
import { chromium } from '../../../web/node_modules/playwright/index.mjs';
import { scriptOutputDir } from '../lib/output-dir.mjs';

const OUT = scriptOutputDir(import.meta.url);
const BASE = 'http://localhost:5175';
const API = 'http://localhost:18081/api/v1';
const ROW = /checklist\.shipment|Shipment checklist/;

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
      trs.map((tr) => tr.querySelector('th, td')?.textContent?.trim()),
    );
    const group = await row.evaluate((tr) => {
      let el = tr.previousElementSibling;
      while (el && el.querySelectorAll('input[type="checkbox"]').length > 0) el = el.previousElementSibling;
      return el?.textContent?.trim() ?? '(no group header row)';
    });
    console.log(`== ${locale} ${width} roles ==  group: ${group}`);
    for (const r of rows) console.log(`  row: ${r}`);
    await row.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await page.screenshot({ path: path.join(OUT, `roles-${locale}-${width}.png`) });

    await page.goto(`${BASE}/templates`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    const body = await page.locator('main').innerText();
    const shipment = /Sevk\b|Shipment/.test(body);
    console.log(`== ${locale} ${width} templates ==  shipment label present: ${shipment}`);
    await page.screenshot({ path: path.join(OUT, `templates-${locale}-${width}.png`) });
    await context.close();
  }
}
await browser.close();
