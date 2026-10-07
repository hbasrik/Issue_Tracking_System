// Pre-shipment warning panel hint text (docs/16 A53), against the test API on
// karea_eolnote_test (never the live DB). Checks, in TR and EN at 1280 and
// 375: the hint states which items block the branch exit and which block the
// depot exit, the old "hard-block rules are unchanged" sentence is gone, and
// the warning list below the hint is still rendered.
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from '../../../web/node_modules/playwright/index.mjs';

const OUT = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:5175';
const API = 'http://localhost:18081/api/v1';
const VIN = 'N7V1K1SA9TK000002';

// "Fabrika"/"Factory" as in the rest of the UI (docs/16 A53 terim düzeltmesi).
const HINT = {
  tr: 'İstasyon adımları ile Test, Sevkiyat ve fabrika aşaması EOL maddeleri tamamlanmadan araç fabrikadan sevk edilemez. Depo aşaması EOL maddeleri tamamlanmadan ve açık hatalar kapanmadan depodan çıkamaz.',
  en: 'The vehicle cannot ship from the Factory until station steps and the Test, Shipment and Factory-phase EOL items are complete. It cannot leave the depot until the depot-phase EOL items are complete and open issues are closed.',
};
const TITLE = { tr: 'Sevk öncesi uyarı', en: 'Pre-shipment warning' };

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

const browser = await chromium.launch({ headless: true });
for (const locale of ['tr', 'en']) {
  for (const [width, height] of [[1280, 720], [375, 667]]) {
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
    await page.goto(`${BASE}/vehicles/${VIN}`, { waitUntil: 'networkidle' });
    const panel = page.locator('[role="status"]').filter({ has: page.locator('h3') }).first();
    await panel.waitFor({ timeout: 15000 });
    const title = (await panel.locator('h3').innerText()).trim();
    const hint = (await panel.locator('p').first().innerText()).trim();
    const items = await panel.locator('li').count();
    const text = await panel.innerText();
    console.log(`  title: ${title}`);
    console.log(`  hint : ${hint}`);
    console.log(`  list items: ${items}`);
    check('panel title', title === TITLE[locale], title);
    check('hint is the new text', hint === HINT[locale]);
    check('old sentence gone', !/hard-block/i.test(text));
    check('no "şube"/"branch" in the hint', !/şube|branch/i.test(hint));
    check('warning list still rendered', items > 0, `${items} items`);
    await panel.evaluate((el) => el.scrollIntoView({ block: 'start' }));
    const box = await panel.boundingBox();
    await page.screenshot({
      path: path.join(OUT, `web-${locale}-${width}-factory.png`),
      clip: { x: box.x, y: box.y, width: box.width, height: Math.min(box.height, height - box.y, 320) },
    });
    await context.close();
  }
}
await browser.close();
console.log(failed ? 'RESULT: FAIL' : 'RESULT: PASS');
process.exit(failed ? 1 : 0);
