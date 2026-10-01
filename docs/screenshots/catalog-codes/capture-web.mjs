/**
 * Admin page proof (code suggestion, format and duplicate-name warnings)
 * against the throwaway karea_codes_test DB after run-verification.py.
 * API under test on :18081, web build (VITE_API_BASE_URL=:18081) previewed
 * on :5174. Never points at :8080 / :5173.
 */
import { chromium } from '../../../web/node_modules/playwright/index.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:5174';
const API = 'http://127.0.0.1:18081/api/v1';
if (API.includes(':8080') || BASE.includes(':5173')) throw new Error('never touch the live stack');

const res = await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'manager@karea.local', password: 'changeme123' }),
});
const session = await res.json();

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.addInitScript(
  (value) => localStorage.setItem('karea.auth.session', JSON.stringify(value)),
  { token: session.token, user: session.user, permissions: session.permissions },
);
let failed = 0;
const log = (ok, name, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

await page.goto(`${BASE}/defect-catalog`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Parçalar' }).click();
await page.getByRole('button', { name: 'Ekle', exact: true }).click();
const aside = page.locator('aside.rounded-xl');
const code = aside.locator('input').first();
const nameTR = aside.locator('input').nth(1);
const nameEN = aside.locator('input').nth(2);
const zone = aside.locator('select').first();
const save = aside.getByRole('button', { name: 'Kaydet' });

await zone.selectOption({ label: '10 — Body' });
await page.waitForTimeout(200);
log((await code.inputValue()) === '10-11', 'Body suggests 10-11', await code.inputValue());
log(await aside.getByTestId('catalog-code-suggestion').isVisible(), 'suggestion hint shown');
await page.screenshot({ path: path.join(OUT, 'web-01-suggest-body.png') });

await zone.selectOption({ label: '30 — Trim' });
await page.waitForTimeout(200);
log((await code.inputValue()) === '30-09', 'switching to Trim suggests 30-09', await code.inputValue());

await zone.selectOption({ label: '10 — Body' });
await code.fill('40-77');
await nameTR.fill('Ayna kapağı');
await nameEN.fill('Mirror cap');
const codeProblem = await aside.getByTestId('catalog-code-problem').innerText();
log(codeProblem.includes('10-NN'), 'wrong prefix flagged', codeProblem);
log(await save.isDisabled(), 'save disabled for wrong prefix');
await page.screenshot({ path: path.join(OUT, 'web-02-wrong-prefix.png') });

await code.fill('ZZZ');
log(await save.isDisabled(), 'save disabled for ZZZ');

await code.fill('10-11');
await nameTR.fill(' test kapı kolu ');
await nameEN.fill('Door handle 2');
const nameProblem = await aside.getByTestId('catalog-name-problem').innerText();
log(nameProblem.startsWith('Bu bölgede aynı adlı bir parça'), 'duplicate name in Body flagged', nameProblem);
log(await save.isDisabled(), 'save disabled for duplicate name');
await page.screenshot({ path: path.join(OUT, 'web-03-duplicate-name.png') });

await zone.selectOption({ label: '40 — Elektrik' });
await page.waitForTimeout(200);
await code.fill('40-05');
log((await aside.getByTestId('catalog-name-problem').count()) === 0, 'same name allowed in Elektrik');
log(!(await save.isDisabled()), 'save enabled in Elektrik');
await page.screenshot({ path: path.join(OUT, 'web-04-same-name-other-zone.png') });
await save.click();
await page.waitForTimeout(800);
const created = (await (await fetch(`${API}/defect-parts`, { headers: { Authorization: `Bearer ${session.token}` } })).json())
  .items.find((p) => p.Code === '40-05');
log(created?.NameTR === 'test kapı kolu', 'saved through the API in Elektrik', JSON.stringify(created && { Code: created.Code, NameTR: created.NameTR }));

await page.getByRole('button', { name: 'Kusur tipleri' }).click();
await page.getByRole('button', { name: 'Ekle', exact: true }).click();
await page.waitForTimeout(200);
log((await code.inputValue()) === '11', 'types suggest 11 (after 01–10, 99 reserved)', await code.inputValue());
await nameTR.fill('ÇİZİK / darbe / hasar');
await nameEN.fill('x');
log((await aside.getByTestId('catalog-name-problem').innerText()).startsWith('Aynı adlı bir kusur tipi'), 'duplicate type name flagged');
await page.screenshot({ path: path.join(OUT, 'web-05-type-suggest-duplicate.png') });

await browser.close();
console.log(failed ? `FAILED (${failed})` : 'ALL CHECKS PASSED');
process.exit(failed ? 1 : 0);
