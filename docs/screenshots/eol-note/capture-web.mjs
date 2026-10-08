// EoL note on an OK answer, web, against the test API on karea_eolnote_test
// (never the live DB). Run after `run-verification.py api`.
import { chromium } from '../../../web/node_modules/playwright/index.mjs';
import path from 'path';
import { fileURLToPath } from 'url';
import { scriptOutputDir } from '../lib/output-dir.mjs';

const OUT = scriptOutputDir(import.meta.url);
const BASE = process.env.BASE ?? 'http://localhost:5175';
const API = process.env.API ?? 'http://localhost:18081/api/v1';
const VIN = process.env.VIN ?? 'N7V1K1SA0TK000003';

const session = await (
  await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'manager@karea.local', password: 'changeme123' }),
  })
).json();

await fetch(`${API}/vehicles/${VIN}/checklist/eol/1`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
  body: JSON.stringify({ status: 'OK', note: 'Akü 12.6 V' }),
});

const browser = await chromium.launch({ headless: true });
let failed = false;
for (const [width, locale] of [[1280, 'tr'], [375, 'tr'], [1280, 'en']]) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
  await context.addInitScript(
    ({ data, locale }) => {
      localStorage.setItem('karea.auth.session', JSON.stringify(data));
      localStorage.setItem('karea-theme-mode', 'light');
      localStorage.setItem('karea-locale', locale);
    },
    { data: { token: session.token, user: session.user, permissions: session.permissions }, locale },
  );
  const page = await context.newPage();
  await page.goto(`${BASE}/vehicles/${VIN}?tab=eol`, { waitUntil: 'networkidle' });
  const saved = page.locator('[data-checklist-active-item="1"]');
  await saved.waitFor({ timeout: 15000 });
  await saved.locator('button[aria-expanded="false"]').click();
  const savedNote = await saved.locator('textarea').inputValue();
  const fresh = page.locator('[data-checklist-active-item="2"]');
  await fresh.getByRole('button', { name: locale === 'tr' ? 'Uygun' : 'OK', exact: true }).click();
  const placeholder = await fresh.locator('textarea').getAttribute('placeholder');
  const required = await fresh.locator('textarea').evaluate((el) => el.required);
  console.log(`${width}px ${locale}: saved OK note=${JSON.stringify(savedNote)}; new OK placeholder=${JSON.stringify(placeholder)} required=${required}`);
  if (savedNote !== 'Akü 12.6 V' || required) failed = true;
  const list = saved.locator('xpath=..');
  await list.scrollIntoViewIfNeeded();
  const box = await list.boundingBox();
  await page.screenshot({
    path: path.join(OUT, `web-${locale}-${width}-ok-note.png`),
    clip: { x: 0, y: Math.max(0, box.y - 20), width, height: Math.min(900, box.height + 40) },
    fullPage: true,
  });
  await context.close();
}
await browser.close();
console.log(failed ? 'WEB CHECKS FAILED' : 'WEB CHECKS PASSED');
process.exit(failed ? 1 : 0);
