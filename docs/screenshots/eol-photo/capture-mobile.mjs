// Mobile EoL photo upload (docs/16 A43) on the react-native-web harness: the
// real EOLChecklistScreen with stubbed API (no backend, nothing written).
// Online: pick -> Save records the answer then uploads to
// CHECKLIST_ITEM_PROGRESS/<ProgressID>. Flagged offline: buttons stay enabled,
// an informational hint is shown. Upload failing mid-way: error in the card.
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from '../mobile-harness/build.mjs';
import { chromium } from '../../../web/node_modules/playwright/index.mjs';

const OUT = path.dirname(fileURLToPath(import.meta.url));
const bundle = await build(fs.mkdtempSync(path.join(os.tmpdir(), 'karea-eol-photo-')));
const browser = await chromium.launch({ headless: true });
const L = {
  tr: { gallery: 'Galeriden fotoğraf seç', picked: 'Seçildi: eol-akü.jpg', save: 'Kaydet', offline: 'Çevrimdışı görünüyorsunuz. Yine de Kaydet’e basabilirsiniz; bağlantı yoksa hata gösterilir.', failed: 'fotoğraf yüklenemedi' },
  en: { gallery: 'Choose from gallery', picked: 'Selected: eol-akü.jpg', save: 'Save', offline: 'You appear to be offline. You can still press Save; if there is no connection you will see the error.', failed: 'photo not uploaded' },
};
const facts = {};
let failed = false;
const check = (key, label, ok, detail = '') => {
  console.log(`${key} [${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed = true;
};

async function open(scene, locale, width) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${pathToFileURL(path.join(bundle, 'index.html')).href}?scene=${scene}&locale=${locale}&theme=light`);
  await page.waitForFunction(() => document.querySelectorAll('#root div').length > 20, null, { timeout: 15000 });
  await page.waitForTimeout(300);
  // Item 1 is answered in the scene, so it starts collapsed; open it.
  await page.locator('[data-testid="eol-answered-toggle-1"]').click();
  await page.waitForTimeout(200);
  return { page, errors };
}

const firstCard = (page, t) =>
  page.locator('div', { has: page.getByText(t.save, { exact: true }) })
    .filter({ hasText: '1. Software Update' }).last();

async function shootCard(page, card, file) {
  await card.scrollIntoViewIfNeeded();
  await card.screenshot({ path: path.join(OUT, file) });
}

for (const locale of ['tr', 'en']) {
  const t = L[locale];
  for (const width of [375, 1280]) {
    {
      const key = `online-${locale}-${width}`;
      const { page, errors } = await open('eol-photo-online', locale, width);
      const card = firstCard(page, t);
      await card.getByText(t.gallery, { exact: true }).click();
      await page.waitForTimeout(200);
      check(key, 'picked file name shown', await card.getByText(t.picked).isVisible());
      await shootCard(page, card, `mobile-${key}-picked.png`);
      await card.getByText(t.save, { exact: true }).click();
      await page.waitForTimeout(400);
      const calls = await page.evaluate(() => window.__calls);
      const names = calls.map((c) => c.name);
      const upload = calls.find((c) => c.name === 'uploadMedia');
      check(key, 'recordChecklist before uploadMedia', names.indexOf('recordChecklist') > -1 && names.indexOf('recordChecklist') < names.indexOf('uploadMedia'), names.join(','));
      check(key, 'upload goes to CHECKLIST_ITEM_PROGRESS/1001', upload && upload.args[0] === 'CHECKLIST_ITEM_PROGRESS' && upload.args[1] === '1001', JSON.stringify(upload?.args?.slice(0, 2)));
      check(key, 'uploaded file is the prepared JPEG', upload && upload.args[2].type === 'image/jpeg' && upload.args[2].name === 'eol-akü.jpg');
      check(key, 'no issue created', !names.includes('createIssue'));
      check(key, 'picked name cleared after upload', !(await card.getByText(t.picked).count()));
      check(key, 'no page errors', errors.length === 0, errors.join('; '));
      facts[key] = { calls: calls.map((c) => ({ name: c.name, args: c.args.slice(0, 2) })) };
      await page.close();
    }
    {
      const key = `offline-${locale}-${width}`;
      const { page, errors } = await open('eol-photo-offline', locale, width);
      const card = firstCard(page, t);
      const btn = card.getByText(t.gallery, { exact: true });
      const disabled = await btn.evaluate((el) => el.closest('[aria-disabled]')?.getAttribute('aria-disabled'));
      check(key, 'gallery button stays enabled (flag is informational)', disabled !== 'true', `aria-disabled=${disabled}`);
      check(key, 'offline hint shown in card', await card.getByText(t.offline, { exact: true }).isVisible());
      await btn.click();
      await page.waitForTimeout(200);
      check(key, 'photo can be picked while flagged offline', await card.getByText(t.picked).isVisible());
      check(key, 'no page errors', errors.length === 0, errors.join('; '));
      await shootCard(page, card, `mobile-${key}.png`);
      await page.close();
    }
    {
      const key = `upload-fails-${locale}-${width}`;
      const { page, errors } = await open('eol-photo-upload-fails', locale, width);
      const card = firstCard(page, t);
      await card.getByText(t.gallery, { exact: true }).click();
      await page.waitForTimeout(200);
      await card.getByText(t.save, { exact: true }).click();
      await page.waitForTimeout(400);
      const text = await card.innerText();
      const line = text.split('\n').find((l) => l.includes(t.failed)) ?? '';
      check(key, 'upload error shown in the card', Boolean(line), JSON.stringify(line));
      check(key, 'picked photo kept for retry', await card.getByText(t.picked).isVisible());
      check(key, 'no page errors', errors.length === 0, errors.join('; '));
      facts[key] = { error: line };
      await shootCard(page, card, `mobile-${key}.png`);
      await page.close();
    }
  }
}
await browser.close();
fs.writeFileSync(path.join(OUT, 'mobile-facts.json'), JSON.stringify(facts, null, 1));
fs.rmSync(bundle, { recursive: true, force: true });
console.log(failed ? 'MOBILE CHECKS FAILED' : 'MOBILE CHECKS PASSED');
process.exit(failed ? 1 : 0);
