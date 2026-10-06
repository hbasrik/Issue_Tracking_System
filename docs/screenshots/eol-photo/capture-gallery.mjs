// Vehicle Detail "Tüm fotoğraflar" after the ListByVIN filter (docs/16 A45),
// against the test API on karea_eolnote_test (never the live DB). EoL item
// photos must be absent; issue, resolution and vehicle photos present.
import { chromium } from '../../../web/node_modules/playwright/index.mjs';
import path from 'path';
import { fileURLToPath } from 'url';

const OUT = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:5175';
const API = 'http://localhost:18081/api/v1';
const VIN = 'N7V1K1SA0TK000003';

const session = await (
  await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'manager@karea.local', password: 'changeme123' }),
  })
).json();

const browser = await chromium.launch({ headless: true });
let failed = false;
for (const width of [1280, 375]) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
  await context.addInitScript((data) => {
    localStorage.setItem('karea.auth.session', JSON.stringify(data));
    localStorage.setItem('karea-theme-mode', 'light');
    localStorage.setItem('karea-locale', 'tr');
  }, { token: session.token, user: session.user, permissions: session.permissions });
  const page = await context.newPage();
  await page.goto(`${BASE}/vehicles/${VIN}`, { waitUntil: 'networkidle' });
  const heading = page.getByRole('heading', { name: 'Tüm fotoğraflar', exact: true });
  await heading.waitFor({ timeout: 15000 });
  const section = heading.locator('xpath=../..');
  await section.locator('ul li').first().waitFor({ timeout: 10000 });
  await page.waitForTimeout(800);
  const names = await section.locator('ul li p.truncate').allInnerTexts();
  const eol = names.filter((n) => n.startsWith('madde'));
  const ok = names.length === 4 && eol.length === 0
    && ['gallery-issue-1.jpg', 'gallery-issue-2.jpg', 'gallery-resolution-1.jpg', 'gallery-vehicle-1.jpg']
      .every((n) => names.includes(n));
  console.log(`${width}px: gallery tiles ${names.length} ${JSON.stringify(names)}; EoL item photos ${eol.length} — ${ok ? 'PASS' : 'FAIL'}`);
  if (!ok) failed = true;
  await section.scrollIntoViewIfNeeded();
  await section.screenshot({ path: path.join(OUT, `web-tr-${width}-gallery.png`) });
  await context.close();
}
await browser.close();
console.log(failed ? 'GALLERY CHECKS FAILED' : 'GALLERY CHECKS PASSED');
process.exit(failed ? 1 : 0);
