// Reproduces the "airplane mode" report on the react-native-web harness: real
// EOLChecklistScreen + real connectivityStore; the stubbed API mirrors
// client.ts request() (no response -> noteTransportFailure + ApiError(0)).
// Not a device test: OS networking, process death and the file cache are
// simulated (page reload = app killed).
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { build } from '../mobile-harness/build.mjs';
import { chromium } from '../../../web/node_modules/playwright/index.mjs';

const bundle = await build(fs.mkdtempSync(path.join(os.tmpdir(), 'karea-eol-repro-')));
const browser = await chromium.launch({ headless: true });
const T = {
  gallery: 'Galeriden fotoğraf seç', picked: 'Seçildi: eol-akü.jpg', save: 'Kaydet',
  offline: 'Çevrimdışısınız. Fotoğraf yalnızca bağlantı varken yüklenebilir.',
};
const url = `${pathToFileURL(path.join(bundle, 'index.html')).href}?scene=eol-photo-online&locale=tr&theme=light`;

async function open(page) {
  await page.goto(url);
  await page.waitForFunction(() => document.querySelectorAll('#root div').length > 20, null, { timeout: 15000 });
  await page.waitForTimeout(300);
}
const card = (page) => page.locator('div', { has: page.getByText(T.save, { exact: true }) })
  .filter({ hasText: '1. Software Update' }).last();
async function state(page, label) {
  const c = card(page);
  const btn = c.getByText(T.gallery, { exact: true }).or(c.getByText(T.picked));
  const disabled = await btn.first().evaluate((el) => el.closest('[aria-disabled]')?.getAttribute('aria-disabled') ?? 'false');
  const text = await c.innerText();
  const calls = await page.evaluate(() => window.__calls.map((x) => x.name));
  const s = {
    photoButtonDisabled: disabled === 'true',
    offlineReasonShown: text.includes(T.offline),
    pickedInMemory: text.includes(T.picked),
    errorLine: text.split('\n').find((l) => /bağlantı|ağ|network|zaman|çevrimdışı/i.test(l) && !l.includes(T.offline)) ?? null,
    calls,
  };
  console.log(`${label}\n  ${JSON.stringify(s, null, 0)}`);
  return s;
}

const page = await browser.newPage({ viewport: { width: 375, height: 900 } });

console.log('== A. screen opened online, then airplane mode (no request made yet)');
await open(page);
await page.evaluate(() => { window.__net = { down: true }; });
await state(page, 'A1 after airplane mode, before any action');

console.log('\n== B. pick a photo and press Save while airplane mode is on');
await card(page).getByText(T.gallery, { exact: true }).click();
await page.waitForTimeout(200);
await state(page, 'B1 photo picked');
await card(page).getByText(T.save, { exact: true }).click();
await page.waitForTimeout(400);
await state(page, 'B2 after Save');

console.log('\n== C. network back, wait 35 s, no user action');
await page.evaluate(() => { window.__net = { down: false }; });
await page.waitForTimeout(35000);
await state(page, 'C1 35 s after network returned');
await card(page).getByText(T.save, { exact: true }).click();
await page.waitForTimeout(400);
await state(page, 'C2 Save pressed again with network back');

console.log('\n== D. photo waiting in memory, app killed (page reload)');
await page.evaluate(() => { window.__net = { down: true }; });
await open(page);
await page.evaluate(() => { window.__net = { down: true }; });
await card(page).getByText(T.gallery, { exact: true }).click();
await page.waitForTimeout(200);
await card(page).getByText(T.save, { exact: true }).click();
await page.waitForTimeout(400);
await state(page, 'D1 photo picked, Save failed offline');
await open(page);
await state(page, 'D2 after kill + reopen (calls reset with the page)');

console.log('\n== E. same photo picked twice while waiting');
await open(page);
await page.evaluate(() => { window.__net = { down: true }; });
const c = card(page);
await c.getByText(T.gallery, { exact: true }).click();
await page.waitForTimeout(200);
await c.getByText(T.save, { exact: true }).click();
await page.waitForTimeout(400);
await page.evaluate(() => { window.__net = { down: false }; });
// The button is disabled now (store offline); force the second pick.
await c.getByText(T.picked).click({ force: true });
await page.waitForTimeout(200);
await state(page, 'E1 second pick attempt (button disabled)');

console.log('\n== F. upload reaches the server but the reply is lost (15 s timeout), then retry');
await open(page);
await page.evaluate(() => { window.__net = { uploadTimesOutAfterServer: true }; });
await card(page).getByText(T.gallery, { exact: true }).click();
await page.waitForTimeout(200);
await card(page).getByText(T.save, { exact: true }).click();
await page.waitForTimeout(400);
await state(page, 'F1 first Save: server stored the photo, client saw a timeout');
await page.evaluate(() => { window.__net = {}; });
await card(page).getByText(T.save, { exact: true }).click();
await page.waitForTimeout(400);
const f2 = await state(page, 'F2 Save again (store offline after the timeout)');
const uploads = f2.calls.filter((n) => n === 'uploadMedia').length;
console.log(`  uploadMedia calls that reached the "server": ${uploads}`);

await browser.close();
fs.rmSync(bundle, { recursive: true, force: true });
