// Permanent regression test (docs/16 A43): the offline flag never blocks EoL
// Save or the photo upload. Real EOLChecklistScreen + real connectivityStore
// + real osNetwork on the react-native-web harness; the stubbed API mirrors
// client.ts request() (window.__net.down -> noteTransportFailure + ApiError(0))
// and window.__setOsNetwork plays an expo-network event.
// Exit code 1 on any failure.
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from '../mobile-harness/build.mjs';
import { chromium } from '../../../web/node_modules/playwright/index.mjs';

const OUT = path.dirname(fileURLToPath(import.meta.url));
const bundle = await build(fs.mkdtempSync(path.join(os.tmpdir(), 'karea-eol-retry-')));
const browser = await chromium.launch({ headless: true });
const T = {
  gallery: 'Galeriden fotoğraf seç', picked: 'Seçildi: eol-akü.jpg', save: 'Kaydet',
  hint: 'Çevrimdışı görünüyorsunuz.', netError: 'Sunucuya bağlanılamadı.',
};
let failed = false;
const check = (key, label, ok, detail = '') => {
  console.log(`${key} [${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed = true;
};

async function open(scene) {
  const page = await browser.newPage({ viewport: { width: 375, height: 900 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${pathToFileURL(path.join(bundle, 'index.html')).href}?scene=${scene}&locale=tr&theme=light`);
  await page.waitForFunction(() => document.querySelectorAll('#root div').length > 20, null, { timeout: 15000 });
  await page.waitForTimeout(300);
  return { page, errors };
}
const card = (page) => page.locator('div', { has: page.getByText(T.save, { exact: true }) })
  .filter({ hasText: '1. Software Update' }).last();
const calls = (page) => page.evaluate(() => window.__calls.map((c) => c.name));
const has = async (page, text) => (await card(page).innerText()).includes(text);
const buttonDisabled = (page) => card(page).getByText(T.gallery, { exact: true }).or(card(page).getByText(T.picked))
  .first().evaluate((el) => el.closest('[aria-disabled]')?.getAttribute('aria-disabled') === 'true');
async function pick(page) {
  await card(page).getByText(T.gallery, { exact: true }).click();
  await page.waitForTimeout(200);
}
async function save(page) {
  await card(page).getByText(T.save, { exact: true }).click();
  await page.waitForTimeout(400);
}
const uploadedAfter = (names, from) => {
  const rest = names.slice(from);
  const r = rest.indexOf('recordChecklist');
  return r > -1 && rest.indexOf('uploadMedia') > r;
};

{
  const key = 'os-reconnect';
  const { page, errors } = await open('eol-photo-online');
  await page.evaluate(() => { window.__net = { down: true }; window.__setOsNetwork(false); });
  await page.waitForTimeout(200);
  check(key, 'OS offline: hint shown', await has(page, T.hint));
  check(key, 'OS offline: photo button still enabled', !(await buttonDisabled(page)));
  await pick(page);
  check(key, 'OS offline: photo can be picked', await has(page, T.picked));
  await save(page);
  check(key, 'Save attempted and the real network error shown', (await calls(page)).includes('recordChecklist:transport-failed') && await has(page, T.netError));
  check(key, 'picked photo kept after the failure', await has(page, T.picked));
  const before = (await calls(page)).length;
  await page.evaluate(() => { window.__net = {}; window.__setOsNetwork(true); });
  await page.waitForTimeout(200);
  check(key, 'OS back: hint gone without any request', !(await has(page, T.hint)) && (await calls(page)).length === before);
  await save(page);
  const names = await calls(page);
  check(key, 'retry with no other action: answer then photo uploaded', uploadedAfter(names, before), names.slice(before).join(','));
  check(key, 'no error after retry, picked cleared', !(await has(page, T.netError)) && !(await has(page, T.picked)));
  check(key, 'no page errors', errors.length === 0, errors.join('; '));
  await page.screenshot({ path: path.join(OUT, 'mobile-offline-retry-os.png') });
  await page.close();
}

{
  const key = 'stale-flag';
  const { page, errors } = await open('eol-photo-online');
  await page.evaluate(() => { window.__net = { down: true }; });
  await pick(page);
  await save(page);
  check(key, 'Save fails while the network is down', (await calls(page)).includes('recordChecklist:transport-failed'));
  check(key, 'flag now offline (hint shown)', await has(page, T.hint));
  const before = (await calls(page)).length;
  // Network back but no OS event: the flag stays stale "offline".
  await page.evaluate(() => { window.__net = {}; });
  check(key, 'stale flag: photo button enabled', !(await buttonDisabled(page)));
  await save(page);
  const names = await calls(page);
  check(key, 'stale flag does not block: answer then photo uploaded', uploadedAfter(names, before), names.slice(before).join(','));
  check(key, 'successful reply clears the flag', !(await has(page, T.hint)));
  check(key, 'no page errors', errors.length === 0, errors.join('; '));
  await page.close();
}

{
  const key = 'starts-offline';
  const { page, errors } = await open('eol-photo-offline');
  check(key, 'hint shown', await has(page, T.hint));
  check(key, 'photo button enabled', !(await buttonDisabled(page)));
  await pick(page);
  await save(page);
  const names = await calls(page);
  check(key, 'Save is sent (network actually up)', uploadedAfter(names, 0), names.join(','));
  check(key, 'no page errors', errors.length === 0, errors.join('; '));
  await page.close();
}

await browser.close();
fs.rmSync(bundle, { recursive: true, force: true });
console.log(failed ? 'OFFLINE RETRY CHECKS FAILED' : 'OFFLINE RETRY CHECKS PASSED');
process.exit(failed ? 1 : 0);
