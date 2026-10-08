// Fresh local install (migrations + seed 01/02/03/05 + admin + 500 VINs):
// the steps given to the user, run in a browser against a COPY of the fresh
// database (karea_freshinstall_test) on the test API :18081 and Vite :5175.
// Never the live database, never :8080.
//
// Signs in through the login form as admin@karea.local, opens Araçlar
// (empty by default: every vehicle is PLANNED) → Planlandı filter, opens the
// first VIN from the top search → EoL. Pending cards start open, so the
// criteria box is checked on open cards (95: 39 KY.FR-09 with criterion +
// method, 56 KY.FR-19 with method only; the 9 kept pre-form items have none),
// the six replaced items must be absent, and closing item 1 shows the icon.
//
//   ADMIN_PASSWORD=... node capture.mjs
import path from 'node:path';
import { chromium } from '../../../web/node_modules/playwright/index.mjs';
import { scriptOutputDir } from '../lib/output-dir.mjs';

const OUT = scriptOutputDir(import.meta.url);
const BASE = 'http://localhost:5175';
const VIN = 'N7V1K1SA9SK000001';
const PASSWORD = process.env.ADMIN_PASSWORD;
if (!PASSWORD) throw new Error('set ADMIN_PASSWORD');

let failed = false;
const check = (label, ok, detail = '') => {
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed = true;
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
await context.addInitScript(() => {
  localStorage.setItem('karea-theme-mode', 'light');
  localStorage.setItem('karea-locale', 'tr');
});
const page = await context.newPage();

console.log('1) login form');
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await page.locator('input[type="email"]').fill('admin@karea.local');
await page.locator('input[type="password"]').fill(PASSWORD);
await page.locator('button[type="submit"]').click();
await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 });
check('signed in', true, new URL(page.url()).pathname);

console.log('2) Araçlar list hides PLANNED by default (Karar 10); open the VIN from the top search');
await page.getByRole('link', { name: 'Araçlar' }).first().click();
await page.waitForLoadState('networkidle');
const emptyList = await page.getByText('Araç bulunamadı').count();
check('Araçlar default list is empty on a fresh install (all 500 PLANNED)', emptyList === 1);
await page.locator('select').first().selectOption({ label: 'Planlandı' });
await page.waitForLoadState('networkidle');
await page.getByText(/500 toplam/).first().waitFor({ timeout: 10000 });
check('Yaşam döngüsü = Planlandı lists them', true, '500 toplam');
await page.screenshot({ path: path.join(OUT, 'vehicles-planned.png') });

const search = page.locator('header input').first();
await search.fill('00001');
const option = page.getByText(VIN).first();
await option.waitFor({ timeout: 10000 });
await option.click();
await page.waitForURL(`**/vehicles/${VIN}**`, { timeout: 15000 });
await page.getByRole('tab', { name: 'EoL' }).click();
await page.locator('[data-checklist-active-item]').first().waitFor({ timeout: 20000 });
await page.waitForLoadState('networkidle');

const card = (no) => page.locator('[data-checklist-active-item]').nth(no - 1);
const lineKinds = (loc) => loc.locator('[data-checklist-criteria-line]').evaluateAll((els) =>
  els.map((e) => e.getAttribute('data-checklist-criteria-line')).join(','));

const items = await page.locator('[data-checklist-active-item]').count();
const openCards = await page.locator('[data-checklist-item-header][aria-expanded="true"]').count();
const boxes = await page.locator('[data-checklist-criteria]').count();
const criterionLines = await page.locator('[data-checklist-criteria-line="criterion"]').count();
const methodLines = await page.locator('[data-checklist-criteria-line="method"]').count();
check('EoL items on the page', items === 104, `${items}`);
check('pending cards start open', openCards === 104, `${openCards}`);
check('criteria boxes on open cards (95 form items)', boxes === 95, `${boxes}`);
check('Kabul kriteri lines (KY.FR-09)', criterionLines === 39, `${criterionLines}`);
check('Kontrol yöntemi lines (KY.FR-09 + KY.FR-19)', methodLines === 95, `${methodLines}`);

const body = await page.locator('main').innerText();
for (const old of ['Software Update', 'Fonksiyonel Komponet Kontrolü', 'EE Check', 'Görsel Kontrol 2', 'Depo Sürüş']) {
  check(`replaced item absent: ${old}`, !body.includes(old));
}
check('replaced item absent: Görsel Kontrol (exact line)',
  !(await page.locator('[data-checklist-item-header]', { hasText: /^\s*\d+\.\s*Görsel Kontrol\s*$/ }).count()));
for (const [no, text] of [[40, 'Araç Motoru'], [46, 'Sürüş'], [103, 'Bumpy Road'], [104, 'Yağmur Testi']]) {
  const header = await card(no).locator('[data-checklist-item-header]').innerText();
  const hasBox = await card(no).locator('[data-checklist-criteria]').count();
  check(`kept item ${no} ${text}: present, no criteria box`, header.includes(text) && hasBox === 0);
}

console.log('3) item 1 (KY.FR-09): criterion + method on the open card');
const one = card(1);
check('item 1 box', (await lineKinds(one)) === 'criterion,method', await lineKinds(one));
console.log('   ', (await one.locator('[data-checklist-criteria]').innerText()).replace(/\n+/g, ' | '));
await one.scrollIntoViewIfNeeded();
await page.screenshot({ path: path.join(OUT, 'eol-item-1-open.png') });

console.log('4) close item 1 -> info icon on the closed card');
await one.locator('[data-checklist-item-header]').click();
check('item 1 closed shows the icon', (await one.locator('[data-checklist-criteria-icon]').count()) === 1);
check('icon tooltip', (await one.locator('[data-checklist-criteria-icon] title').textContent()) ===
  'Bu maddenin kabul kriteri veya kontrol yöntemi var');
await one.scrollIntoViewIfNeeded();
await page.screenshot({ path: path.join(OUT, 'eol-item-1-closed-icon.png') });

console.log('5) depot item 47 (KY.FR-19): method only');
const depot = card(47);
check('item 47 box', (await lineKinds(depot)) === 'method', await lineKinds(depot));
await depot.scrollIntoViewIfNeeded();
await page.screenshot({ path: path.join(OUT, 'eol-item-47-depot.png') });

await browser.close();
console.log(failed ? 'SOME CHECKS FAILED' : 'ALL CHECKS PASSED');
process.exit(failed ? 1 : 0);
