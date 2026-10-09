// Read-only: the Roles page after migration 0045. checklist.shipment.* is
// gone from the database, so no row falls into the "other" group and the
// group is not drawn. Test API :18081 / web :5175 on a *_test database
// (never the live DB, never :8080). Nothing is saved.
import path from 'path';
import { chromium } from '../../../web/node_modules/playwright/index.mjs';
import { scriptOutputDir } from '../lib/output-dir.mjs';

const OUT = scriptOutputDir(import.meta.url);
const BASE = 'http://localhost:5175';
const API = 'http://localhost:18081/api/v1';

const session = await (
  await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'manager@karea.local', password: 'changeme123' }),
  })
).json();
if (!session.token) throw new Error('login on the test API failed');

const browser = await chromium.launch({ headless: true });
let failed = false;
for (const [locale, other] of [['tr', 'Diğer'], ['en', 'Other']]) {
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
    await page.locator('tr', { hasText: 'admin.manage_masters' }).first().waitFor({ timeout: 15000 });
    const rows = await page.locator('tbody tr').allInnerTexts();
    const otherHeader = rows.filter((r) => r.trim() === other).length;
    const shipmentRows = rows.filter((r) => /checklist\.shipment|Shipment checklist/.test(r)).length;
    const lastHeader = await page.locator('tbody tr').evaluateAll((trs) =>
      trs.filter((tr) => tr.querySelectorAll('input[type="checkbox"]').length === 0).map((tr) => tr.textContent.trim()).pop(),
    );
    console.log(`== ${locale} ${width} ==  rows ${rows.length}, "${other}" header ${otherHeader}, shipment rows ${shipmentRows}, last group "${lastHeader}"`);
    if (otherHeader || shipmentRows) failed = true;
    await page.locator('tr', { hasText: 'admin.manage_masters' }).first().evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await page.screenshot({ path: path.join(OUT, `roles-${locale}-${width}.png`) });
    await context.close();
  }
}
await browser.close();
if (failed) {
  console.error('FAIL: other group or shipment rows present');
  process.exit(1);
}
console.log('PASS: no other group, no checklist.shipment.* row');
