// Shipment checklist removal (Karar 33) on the web vehicle detail page,
// against the test API on :18081 / web on :5175 backed by
// karea_shiprm_seed_test (never the live DB, never :8080). In TR and EN at
// 1280 and 375 it checks that:
//  - the tab list has no Shipment tab (overview, Test, EoL, Issues, Audit);
//  - /vehicles/<vin>?tab=shipment opens the overview tab with no error;
//  - the pre-shipment warning lists no Shipment checklist lines;
//  - the EoL tab's branch-ship blockers name no Shipment checklist.
import path from 'path';
import { chromium } from '../../../web/node_modules/playwright/index.mjs';
import { scriptOutputDir } from '../lib/output-dir.mjs';

const OUT = scriptOutputDir(import.meta.url);
const BASE = 'http://localhost:5175';
const API = 'http://localhost:18081/api/v1';
// 10050: stations complete, EoL BRANCH, Test 17 NOT_OK (seed 06).
const VIN = 'N7V1K1SA1TK000009';

const TABS = {
  tr: ['Genel bakış', 'Test', 'EoL', 'Issues', 'Denetim kaydı'],
  en: ['Overview', 'Test', 'EoL', 'Issues', 'Audit log'],
};
// The removed copy (tab, panel title, readiness list, branch blocker). Bare
// "Sevkiyat" is not used: it is also the TR heading of an EoL depot section.
const SHIPMENT_TEXT = /Sevkiyat checklist|Sevk kontrol listesi|Sevk: \d+ madde|Shipment checklist|Shipment: \d+ items|Sevk checklist|Test, Sevkiyat|Test, Shipment/i;
const EOL_LOADING = { tr: 'EoL yükleniyor', en: 'Loading EoL' };
const TEST_BLOCKER = { tr: /Test: \d+ madde kaldı/, en: /Test: \d+ items remaining/ };

const session = await (
  await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'manager@karea.local', password: 'changeme123' }),
  })
).json();
if (!session.token) throw new Error('login on the test API failed');

let failed = false;
const check = (label, ok, detail = '') => {
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed = true;
};

const browser = await chromium.launch({ headless: true });
for (const locale of ['tr', 'en']) {
  for (const [width, height] of [[1280, 900], [375, 812]]) {
    console.log(`== ${locale} ${width}x${height}, ${VIN} ==`);
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
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    const shot = (name) => page.screenshot({ path: path.join(OUT, `web-${locale}-${width}-${name}.png`), fullPage: true });

    await page.goto(`${BASE}/vehicles/${VIN}?tab=shipment`, { waitUntil: 'networkidle' });
    const tablist = page.locator('[role="tablist"]');
    await tablist.waitFor({ timeout: 15000 });
    const tabs = (await tablist.locator('[role="tab"]').allInnerTexts()).map((s) => s.trim());
    const selected = (await tablist.locator('[role="tab"][aria-selected="true"]').innerText()).trim();
    console.log(`  tabs: ${tabs.join(' | ')}  selected: ${selected}`);
    check('tab list has no Shipment tab', JSON.stringify(tabs) === JSON.stringify(TABS[locale]), tabs.join(','));
    check('?tab=shipment falls back to overview', selected === TABS[locale][0], selected);

    const panel = page.locator('[role="status"]').filter({ has: page.locator('h3') }).first();
    await panel.waitFor({ timeout: 15000 });
    const lines = (await panel.locator('li').allInnerTexts()).map((s) => s.trim());
    console.log(`  readiness lines (${lines.length}):`);
    for (const l of lines) console.log(`    • ${l}`);
    check('readiness lists items', lines.length > 0, `${lines.length}`);
    check('readiness has no Shipment line', !lines.some((l) => SHIPMENT_TEXT.test(l)));
    const hint = (await panel.locator('p').first().innerText()).trim();
    console.log(`  hint: ${hint}`);
    check('readiness hint names no Shipment checklist', !SHIPMENT_TEXT.test(hint));
    await shot('overview-from-tab-shipment');

    await tablist.locator('[role="tab"]', { hasText: TABS[locale][2] }).click();
    await page.waitForFunction(
      (loading) => !document.querySelector('main')?.innerText.includes(loading),
      EOL_LOADING[locale],
      { timeout: 15000 },
    );
    await page.waitForLoadState('networkidle');
    const eolText = await page.locator('main').innerText();
    const blocker = eolText.split('\n').find((l) => TEST_BLOCKER[locale].test(l));
    console.log(`  EoL tab Test blocker: ${blocker ?? '(none)'}`);
    check('EoL tab loaded with the Test blocker', Boolean(blocker));
    check('EoL tab names no Shipment checklist', !SHIPMENT_TEXT.test(eolText));
    if (blocker) {
      await page.getByText(blocker, { exact: true }).first()
        .evaluate((el) => el.scrollIntoView({ block: 'center' }));
    }
    await page.screenshot({ path: path.join(OUT, `web-${locale}-${width}-eol-tab.png`) });

    check('no page or console errors', errors.length === 0, errors.join(' / '));
    await context.close();
  }
}
await browser.close();
console.log(failed ? 'RESULT: FAIL' : 'RESULT: PASS');
process.exit(failed ? 1 : 0);
