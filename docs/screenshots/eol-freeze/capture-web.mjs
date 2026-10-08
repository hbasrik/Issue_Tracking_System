// Frozen checklist items on the web (Karar 29, docs/16 A52), against the test
// API on karea_eolnote_test after run-api-trials.sh (never the live DB).
// TR and EN at 1280 and 375:
// - N7V1K1SA1TK000012 (shipped from the branch): branch EOL panel frozen,
//   depot panel still editable; Test and Shipment panels frozen.
// - N7V1K1SAXTK000011 (released from the depot): depot panel frozen, the
//   photo added before release opens full size.
// - N7V1K1SA2TK000018 (delivered): both EOL panels frozen.
// A frozen panel shows the hint, is not dimmed, its item headers are not
// buttons and stay closed when clicked, and it has no answer buttons, Save,
// file input or checkbox.
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from '../../../web/node_modules/playwright/index.mjs';
import { scriptOutputDir } from '../lib/output-dir.mjs';

const OUT = scriptOutputDir(import.meta.url);
const BASE = 'http://localhost:5175';
const API = 'http://localhost:18081/api/v1';
const DEPOT = 'N7V1K1SA1TK000012';
const RELEASED = 'N7V1K1SAXTK000011';
const DELIVERED = 'N7V1K1SA2TK000018';

const HINT = {
  tr: {
    BRANCH_SHIPPED: 'Araç fabrikadan sevk edildi; bu maddeler kilitli. Cevaplar değiştirilemez, yeni fotoğraf eklenemez.',
    DEPOT_RELEASED: 'Araç depodan çıktı; bu maddeler kilitli. Cevaplar değiştirilemez, yeni fotoğraf eklenemez.',
    DELIVERED: 'Araç teslim edildi; bu maddeler kilitli. Cevaplar değiştirilemez, yeni fotoğraf eklenemez.',
  },
  en: {
    BRANCH_SHIPPED: 'The vehicle has shipped from the Factory; these items are locked. Answers cannot change and no new photos can be added.',
    DEPOT_RELEASED: 'The vehicle has been released from the depot; these items are locked. Answers cannot change and no new photos can be added.',
    DELIVERED: 'The vehicle has been delivered; these items are locked. Answers cannot change and no new photos can be added.',
  },
};

const session = await (
  await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'manager@karea.local', password: 'changeme123' }),
  })
).json();

let failed = false;
const check = (label, ok, detail = '') => {
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed = true;
};

// Every item of a frozen panel: no answer controls, header is not a button
// and a click on it opens nothing.
async function checkFrozenPanel(page, panel, reason, locale, label) {
  await panel.waitFor({ timeout: 15000 });
  const attr = await panel.getAttribute('data-checklist-frozen');
  check(`${label}: panel frozen ${reason}`, attr === reason, `data-checklist-frozen=${attr}`);
  const hint = (await panel.locator('[data-checklist-frozen-hint]').innerText().catch(() => '')).trim();
  check(`${label}: hint text`, hint === HINT[locale][reason], hint);
  const opacity = await panel.evaluate((el) => getComputedStyle(el).opacity);
  check(`${label}: not dimmed`, opacity === '1', `opacity ${opacity}`);
  const items = panel.locator('li[data-checklist-active-item]');
  const n = await items.count();
  const frozenItems = await panel.locator('li[data-checklist-frozen]').count();
  check(`${label}: every item frozen`, n > 0 && frozenItems === n, `${frozenItems}/${n}`);
  const headerButtons = await panel.locator('button[data-checklist-item-header], [aria-expanded]').count();
  check(`${label}: no clickable item header`, headerButtons === 0, `${headerButtons}`);
  const photoButtons = await panel.locator('[data-checklist-photos] button').count();
  const allButtons = await panel.locator('li[data-checklist-active-item] button').count();
  check(`${label}: no answer or Save buttons`, allButtons === photoButtons, `${allButtons} buttons, ${photoButtons} photo`);
  const inputs = await panel.locator('input, textarea').count();
  check(`${label}: no file input, checkbox or note field`, inputs === 0, `${inputs}`);
  const header = panel.locator('[data-checklist-item-header]').first();
  if (await header.count()) {
    await header.click();
    await page.waitForTimeout(150);
    const afterClick = await panel.locator('li[data-checklist-active-item] button').count();
    const textareas = await panel.locator('textarea, input').count();
    check(`${label}: header click opens nothing`, afterClick === photoButtons && textareas === 0);
  }
}

const browser = await chromium.launch({ headless: true });
for (const locale of ['tr', 'en']) {
  for (const [width, height] of [[1280, 720], [375, 667]]) {
    console.log(`== ${locale} ${width}x${height} ==`);
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
    const panels = () => page.locator('div[data-checklist-active-total]');

    await page.goto(`${BASE}/vehicles/${DEPOT}?tab=eol`, { waitUntil: 'networkidle' });
    await checkFrozenPanel(page, panels().nth(0), 'BRANCH_SHIPPED', locale, `${DEPOT} branch EOL`);
    const depotPanel = panels().nth(1);
    check(`${DEPOT} depot EOL: not frozen`, (await depotPanel.getAttribute('data-checklist-frozen')) === null);
    const openHeaders = await depotPanel.locator('button[data-checklist-item-header]').count();
    check(`${DEPOT} depot EOL: headers clickable`, openHeaders > 0, `${openHeaders}`);
    for (const tab of ['test', 'shipment']) {
      await page.goto(`${BASE}/vehicles/${DEPOT}?tab=${tab}`, { waitUntil: 'networkidle' });
      await checkFrozenPanel(page, panels().first(), 'BRANCH_SHIPPED', locale, `${DEPOT} ${tab}`);
      if (tab === 'test') {
        const p = panels().first();
        await p.evaluate((el) => el.scrollIntoView({ block: 'start' }));
        const box = await p.boundingBox();
        await page.screenshot({
          path: path.join(OUT, `web-${locale}-${width}-test-frozen.png`),
          clip: { x: box.x, y: box.y, width: box.width, height: Math.min(box.height, height - box.y, 360) },
        });
      }
    }

    await page.goto(`${BASE}/vehicles/${RELEASED}?tab=eol`, { waitUntil: 'networkidle' });
    const released = panels().nth(1);
    await checkFrozenPanel(page, released, 'DEPOT_RELEASED', locale, `${RELEASED} depot EOL`);
    const photo = released.locator('[data-checklist-photos] button').first();
    check(`${RELEASED}: photo added before release is shown`, (await photo.count()) === 1);
    const hintEl = released.locator('[data-checklist-frozen-hint]');
    await hintEl.evaluate((el) => el.scrollIntoView({ block: 'start' }));
    const photoItem = released.locator('li[data-checklist-active-item]:has([data-checklist-photos])').first();
    const hb = await hintEl.boundingBox();
    const ib = await photoItem.boundingBox();
    await page.screenshot({
      path: path.join(OUT, `web-${locale}-${width}-depot-frozen.png`),
      clip: { x: hb.x - 8, y: hb.y - 8, width: Math.max(hb.width, ib.width) + 16, height: Math.min(ib.y + ib.height - hb.y + 16, height - hb.y) },
    });
    await photo.click();
    const dialog = page.locator('[role="dialog"]');
    await dialog.waitFor({ timeout: 5000 });
    const img = dialog.locator('img');
    await img.waitFor({ timeout: 10000 });
    await page.waitForFunction(() => {
      const i = document.querySelector('[role="dialog"] img');
      return i && i.complete && i.naturalWidth > 0;
    }, null, { timeout: 10000 }).catch(() => {});
    const natural = await img.evaluate((i) => i.naturalWidth);
    check(`${RELEASED}: photo opens full size`, natural > 64, `naturalWidth ${natural}`);
    await page.screenshot({ path: path.join(OUT, `web-${locale}-${width}-depot-frozen-photo.png`) });
    await dialog.getByRole('button').first().click();
    check(`${RELEASED}: viewer closes`, (await dialog.count()) === 0);

    await page.goto(`${BASE}/vehicles/${DELIVERED}?tab=eol`, { waitUntil: 'networkidle' });
    await checkFrozenPanel(page, panels().nth(0), 'DELIVERED', locale, `${DELIVERED} branch EOL`);
    await checkFrozenPanel(page, panels().nth(1), 'DELIVERED', locale, `${DELIVERED} depot EOL`);

    await context.close();
  }
}
await browser.close();
console.log(failed ? 'RESULT: FAIL' : 'RESULT: PASS');
process.exit(failed ? 1 : 0);
