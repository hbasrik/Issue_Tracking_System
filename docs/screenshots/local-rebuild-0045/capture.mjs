// Local rebuild to migration 0045: the steps given to the user, run in a
// browser against a COPY of the rebuilt database (karea_rebuild45_test) on
// the test API :18081 and Vite :5175. Never the live database, never :8080.
//
// Signs in as admin@karea.local through the login form, goes through the
// forced password change (on the copy only), then checks: Roles has no
// checklist.shipment.* row and no "Diğer" group, Templates lists only EOL and
// Test, a vehicle has no Sevkiyat tab.
//
//   ADMIN_PASSWORD=... COPY_NEW_PASSWORD=... node capture.mjs
import path from 'node:path';
import { chromium } from '../../../web/node_modules/playwright/index.mjs';
import { scriptOutputDir } from '../lib/output-dir.mjs';

const OUT = scriptOutputDir(import.meta.url);
const BASE = 'http://localhost:5175';
const VIN = 'N7V1K1SA9SK000001';
const PASSWORD = process.env.ADMIN_PASSWORD;
const NEW_PASSWORD = process.env.COPY_NEW_PASSWORD;
if (!PASSWORD || !NEW_PASSWORD) throw new Error('set ADMIN_PASSWORD and COPY_NEW_PASSWORD');

let failed = false;
const check = (label, ok, detail = '') => {
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed = true;
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await context.addInitScript(() => {
  localStorage.setItem('karea-theme-mode', 'light');
  localStorage.setItem('karea-locale', 'tr');
});
const page = await context.newPage();

console.log('1) giriş formu');
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await page.locator('input[type="email"]').fill('admin@karea.local');
await page.locator('input[type="password"]').fill(PASSWORD);
await page.locator('button[type="submit"]').click();
await page.waitForURL('**/change-password', { timeout: 15000 });
check('first login goes to the forced password change', true, new URL(page.url()).pathname);
await page.screenshot({ path: path.join(OUT, 'change-password.png') });

console.log('2) zorunlu şifre değişikliği');
await page.locator('input[autocomplete="current-password"]').fill(PASSWORD);
const fresh = page.locator('input[autocomplete="new-password"]');
await fresh.nth(0).fill(NEW_PASSWORD);
await fresh.nth(1).fill(NEW_PASSWORD);
await page.locator('button[type="submit"]').click();
await page.waitForURL((u) => !u.pathname.startsWith('/change-password'), { timeout: 15000 });
check('password changed, app opens', true, new URL(page.url()).pathname);
await page.waitForLoadState('networkidle');
await page.waitForTimeout(1000);
// The change bumps tokens_valid_from, which revokes the JWT of this very
// session unless login and change fall in the same second; the next request
// gets 401 and the app returns to the login page. Sign in with the new one.
if (new URL(page.url()).pathname.startsWith('/login')) {
  const expired = await page.getByText('Oturumunuzun süresi doldu').count();
  console.log(`  back on /login after the change (session-expired message: ${expired > 0}); signing in with the new password`);
  await page.screenshot({ path: path.join(OUT, 'relogin.png') });
  await page.locator('input[type="email"]').fill('admin@karea.local');
  await page.locator('input[type="password"]').fill(NEW_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 });
  await page.waitForLoadState('networkidle');
  check('new password signs in, no second change prompt', !new URL(page.url()).pathname.startsWith('/change-password'), new URL(page.url()).pathname);
} else {
  console.log('  stayed signed in after the change');
}
await page.screenshot({ path: path.join(OUT, 'home.png') });

// The session lives in memory unless "Beni hatırla" is ticked, so the steps
// use the menu like the user would; a full page load would sign out.
console.log('3) Roller');
await page.getByRole('link', { name: 'Roller' }).first().click();
await page.locator('tr', { hasText: 'admin.manage_masters' }).first().waitFor({ timeout: 15000 });
await page.waitForLoadState('networkidle');
const rows = await page.locator('tbody tr').allInnerTexts();
const headers = await page.locator('tbody tr').evaluateAll((trs) =>
  trs.filter((tr) => tr.querySelectorAll('input[type="checkbox"]').length === 0).map((tr) => tr.textContent.trim()),
);
console.log(`  groups: ${headers.join(' | ')}`);
check('no checklist.shipment.* row', rows.filter((r) => /checklist\.shipment|Sevkiyat checklist/i.test(r)).length === 0);
check('no "Diğer" group', !headers.includes('Diğer'), `${headers.length} groups`);
await page.screenshot({ path: path.join(OUT, 'roles.png'), fullPage: true });

console.log('4) Şablonlar');
await page.getByRole('link', { name: 'Şablonlar' }).first().click();
const tplRows = page.locator('table tbody tr.cursor-pointer');
await tplRows.first().waitFor({ timeout: 15000 });
await page.waitForLoadState('networkidle');
const types = await tplRows.evaluateAll((trs) => trs.map((tr) => tr.children[1]?.textContent?.trim()));
const counts = await tplRows.evaluateAll((trs) => trs.map((tr) => tr.children[2]?.textContent?.trim()));
console.log(`  types: ${types.join(', ')}  items: ${counts.join(', ')}`);
check('two templates', types.length === 2, `${types.length}`);
check('no Sevkiyat template', !types.some((x) => /Sevk|Shipment/i.test(x)));
await page.screenshot({ path: path.join(OUT, 'templates.png') });

console.log('5) araç detayı sekmeleri (üstteki aramadan)');
await page.locator('header input').first().fill('00001');
await page.getByText(VIN).first().click();
await page.waitForURL(`**/vehicles/${VIN}**`, { timeout: 15000 });
const tabs = page.getByRole('tab');
await tabs.first().waitFor({ timeout: 15000 });
const tabNames = (await tabs.allInnerTexts()).map((s) => s.trim());
console.log(`  tabs: ${tabNames.join(' | ')}`);
check('no Sevkiyat tab', !tabNames.some((x) => /Sevkiyat/.test(x)));
check('EoL and Test tabs present', tabNames.includes('EoL') && tabNames.some((x) => /^Test/.test(x)));
await page.screenshot({ path: path.join(OUT, 'vehicle-tabs.png') });

await browser.close();
console.log(failed ? 'RESULT: FAIL' : 'RESULT: PASS');
process.exit(failed ? 1 : 0);
