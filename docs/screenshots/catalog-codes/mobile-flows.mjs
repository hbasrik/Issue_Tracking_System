/**
 * Mobile evidence for the queue repair and the foreground catalogue refresh,
 * rendered with the mobile harness (real PendingReportsScreen, real queue and
 * reference-cache providers; storage and API stubbed by the harness).
 *
 * Usage: node docs/screenshots/catalog-codes/mobile-flows.mjs <outDir>
 * Writes PNGs and mobile-flows.json; exits non-zero when a check fails.
 */
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { build } from '../mobile-harness/build.mjs';
import { chromium } from '../../../web/node_modules/playwright/index.mjs';

const outDir = path.resolve(process.argv[2] ?? 'mobile-flows-out');
fs.mkdirSync(outDir, { recursive: true });
const bundle = await build(fs.mkdtempSync(path.join(os.tmpdir(), 'karea-mobile-flows-')));
const QUEUED_ID = '6f1c2a9e-4b7d-4c1e-9a3f-2d8b5e7c1a40';
const WIDTH = 390;
const MIN = 60_000;

const browser = await chromium.launch({ headless: true });
const results = {};
const failures = [];
const check = (name, ok, detail) => {
  results[name] = { ok, detail };
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`);
  if (!ok) failures.push(name);
};
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function open(scene, locale, clockAt) {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  if (clockAt) await page.clock.install({ time: clockAt });
  await page.goto(`${pathToFileURL(path.join(bundle, 'index.html')).href}?scene=${scene}&locale=${locale}&theme=light`);
  await page.getByText(/VIN NM0KTSKRC2XSB0142/).waitFor({ timeout: 15000 });
  return { page, errors };
}

async function shoot(page, file) {
  const h = await page.evaluate(() =>
    Math.max(...[...document.querySelectorAll('div')].map((d) => d.scrollHeight), 600),
  );
  await page.setViewportSize({ width: WIDTH, height: Math.min(h, 3000) });
  await pause(400);
  await page.screenshot({ path: path.join(outDir, file) });
}

const calls = (page) => page.evaluate(() => window.__calls);
const partFetches = async (page) =>
  (await calls(page)).filter((c) => c.name === 'listDefectCatalog_parts').length;
const queueStore = (page) =>
  page.evaluate(() => JSON.parse(window.__KAREA_STORE['karea.issueReportQueue.v1'] ?? '{}'));
const bodyText = (page) => page.evaluate(() => document.body.innerText);

// --- A. Rejected queue item: clear reason, fix classification, resend.
for (const locale of ['tr', 'en']) {
  const { page, errors } = await open('queue-rejected', locale);
  const fixLabel = locale === 'tr' ? 'Sınıflandırmayı düzelt' : 'Fix classification';
  const reason = locale === 'tr'
    ? 'Bu parça katalogdan kaldırıldı, lütfen yeni bir parça seçin.'
    : 'This part was removed from the catalogue, please choose a new part.';
  await page.getByText(fixLabel).waitFor();
  await page.waitForFunction(() => [...document.images].every((i) => i.complete));
  check(`A-${locale} rejection reason shown`, (await bodyText(page)).includes(reason), reason);
  await shoot(page, `queue-01-rejected-${locale}-${WIDTH}.png`);
  if (locale === 'en') {
    check('A-en no page errors', errors.length === 0, errors);
    await page.close();
    continue;
  }

  await page.getByText(fixLabel).click();
  await page.getByTestId('queue-fix-form').waitFor();
  const formText = await bodyText(page);
  check('A editor keeps the still-active defect type', formText.includes('03 · Çizik / darbe / hasar'));
  check('A editor clears the removed part', !formText.includes('Ayna'));
  await shoot(page, `queue-02-fix-form-tr-${WIDTH}.png`);

  await page.getByText('Bölge', { exact: true }).click();
  await page.getByText('30 · Trim', { exact: true }).click();
  await page.getByText('Parça', { exact: true }).click();
  await page.getByText('30-02 · Cam', { exact: true }).click();
  await pause(200);
  await shoot(page, `queue-03-fixed-tr-${WIDTH}.png`);

  const before = (await queueStore(page))['7'][0];
  await page.getByText('Kaydet ve gönder').click();
  await page.getByText('Bekleyen gönderim yok').waitFor({ timeout: 10000 });
  await pause(300);
  const all = await calls(page);
  const creates = all.filter((c) => c.name === 'createIssue');
  const uploads = all.filter((c) => c.name === 'uploadMedia');
  const sent = creates.at(-1)?.args ?? [];
  check('A resend sends exactly one create', creates.length === 1, creates.length);
  check('A resend uses the new part (30-02 Cam, id 12)', sent[0]?.defect_part_id === 12, sent[0]?.defect_part_id);
  check('A resend keeps the defect type', sent[0]?.defect_type_id === 3);
  check('A resend keeps description and VIN',
    sent[0]?.description === before.payload.description && sent[0]?.vin === before.payload.vin);
  check('A resend reuses the idempotency key', sent[1]?.idempotencyKey === QUEUED_ID, sent[1]);
  check('A photo uploaded from the queued copy',
    uploads.length === 1 && uploads[0].args[1] === '501' &&
      uploads[0].args[2]?.uri === before.photoUri && uploads[0].args[2]?.name === 'sag-ayna.jpg',
    uploads.map((u) => [u.args[0], u.args[1], u.args[2]?.name]));
  check('A queue empty after send', ((await queueStore(page))['7'] ?? []).length === 0);
  check('A no page errors', errors.length === 0, errors);
  results.A_calls = all.map((c) => ({ name: c.name, args: c.args.map((a) => (typeof a === 'string' && a.length > 60 ? `${a.slice(0, 60)}…` : a)) }))
    .map((c) => JSON.parse(JSON.stringify(c, (k, v) => (k === 'uri' && typeof v === 'string' ? `${v.slice(0, 32)}…` : v))));
  await shoot(page, `queue-04-sent-tr-${WIDTH}.png`);
  await page.close();
}

// --- B. Foreground refresh with a fake clock (app stays open, no navigation).
{
  const t0 = new Date('2026-10-01T09:00:00+03:00');
  const { page, errors } = await open('queue-refresh', 'tr', t0);
  await pause(500);
  check('B first fetch on open', (await partFetches(page)) === 1, await partFetches(page));
  check('B item still sendable before refresh', (await bodyText(page)).includes('Şimdi gönder'));
  await page.clock.runFor(2_000);
  await shoot(page, `queue-05-before-refresh-tr-${WIDTH}.png`);

  await page.clock.runFor(14 * MIN);
  await pause(300);
  check('B no refetch at 14 min', (await partFetches(page)) === 1, await partFetches(page));

  await page.clock.runFor(1 * MIN + 5_000);
  await pause(500);
  const at15 = await partFetches(page);
  check('B refetched at 15 min while open', at15 === 2, at15);
  const text15 = await bodyText(page);
  check('B removed part flagged without user action',
    text15.includes('Bu parça katalogdan kaldırıldı, lütfen yeni bir parça seçin.'));
  results.B_fetch_times = (await calls(page))
    .filter((c) => c.name === 'listDefectCatalog_parts')
    .map((c) => `+${Math.round((c.at - t0.getTime()) / 1000)} s`);
  await shoot(page, `queue-06-after-15min-tr-${WIDTH}.png`);

  await page.getByText('Sınıflandırmayı düzelt').click();
  await page.getByTestId('catalog-refresh').waitFor();
  check('B age label after auto refresh', (await bodyText(page)).includes('Katalog az önce güncellendi'));
  await page.clock.runFor(5 * MIN);
  await pause(300);
  check('B age label ticks while open', (await bodyText(page)).includes('Katalog 5 dk önce güncellendi'));
  await shoot(page, `queue-07-age-5min-tr-${WIDTH}.png`);

  await page.getByTestId('catalog-refresh').click();
  await page.clock.runFor(1_000);
  await pause(500);
  check('B manual refresh fetches', (await partFetches(page)) === 3, await partFetches(page));
  check('B age label reset by manual refresh', (await bodyText(page)).includes('Katalog az önce güncellendi'));
  await shoot(page, `queue-08-manual-refresh-tr-${WIDTH}.png`);
  check('B no page errors', errors.length === 0, errors);
  await page.close();
}

await browser.close();
fs.rmSync(bundle, { recursive: true, force: true });
fs.writeFileSync(path.join(outDir, 'mobile-flows.json'), JSON.stringify(results, null, 1));
if (failures.length) {
  console.error(`mobile flows: FAILED (${failures.length})`);
  process.exit(1);
}
console.log('mobile flows: ALL CHECKS PASSED ->', outDir);
