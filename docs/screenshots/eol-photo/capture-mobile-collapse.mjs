// EoL answered-item badge (docs/16 A47) on the react-native-web harness: real
// EOLChecklistScreen, stubbed API (nothing written). An answered item shows
// as a badge with its answer, note and photos; tapping it opens the editor
// (answer and note prefilled), Cancel closes it, Save closes it again.
// Exit code 1 on any failure.
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from '../mobile-harness/build.mjs';
import { chromium } from '../../../web/node_modules/playwright/index.mjs';

const OUT = path.dirname(fileURLToPath(import.meta.url));
const bundle = await build(fs.mkdtempSync(path.join(os.tmpdir(), 'karea-eol-collapse-')));
const browser = await chromium.launch({ headless: true });
const L = {
  tr: { ok: 'Uygun', notOk: 'Uygun değil', note: 'Not: ölçüm 12.6', save: 'Kaydet', cancel: 'İptal', edit: 'Düzenle' },
  en: { ok: 'OK', notOk: 'Not OK', note: 'Note: ölçüm 12.6', save: 'Save', cancel: 'Cancel', edit: 'Edit' },
};
let failed = false;
const check = (key, label, ok, detail = '') => {
  console.log(`${key} [${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed = true;
};

for (const locale of ['tr', 'en']) {
  const t = L[locale];
  for (const width of [375, 1280]) {
    const key = `collapse-${locale}-${width}`;
    const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 2 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`${pathToFileURL(path.join(bundle, 'index.html')).href}?scene=eol-photos-list&locale=${locale}&theme=light`);
    await page.waitForFunction(() => document.querySelectorAll('#root div').length > 20, null, { timeout: 15000 });
    await page.waitForTimeout(400);

    const badge = page.locator('[data-testid="eol-answered-1"]');
    const text = await badge.innerText();
    check(key, 'answered item 1 is a badge', await badge.isVisible());
    check(key, 'badge shows the answer', text.includes(t.ok), JSON.stringify(text.split('\n')));
    check(key, 'badge shows the note', text.includes(t.note));
    check(key, 'badge shows all 3 photos', (await badge.locator('[data-testid="checklist-item-photos"] img').count()) === 3);
    check(key, 'badge has no editor (no Save)', !text.includes(t.save));
    const answered = await page.locator('[data-testid^="eol-answered-toggle-"]').count();
    check(key, 'every answered active item collapsed (items 1,2,3)', answered === 3, String(answered));
    await badge.scrollIntoViewIfNeeded();
    await badge.screenshot({ path: path.join(OUT, `mobile-${key}-badge.png`) });

    await page.locator('[data-testid="eol-answered-toggle-1"]').click();
    await page.waitForTimeout(200);
    check(key, 'tap opens the editor', !(await badge.count()));
    const editor = page.locator('div', { has: page.getByText(t.cancel, { exact: true }) }).filter({ hasText: '1. Software Update' }).last();
    const noteValue = await editor.locator('textarea').first().inputValue();
    check(key, 'editor prefilled with the saved note', noteValue === 'ölçüm 12.6', JSON.stringify(noteValue));
    await editor.scrollIntoViewIfNeeded();
    await editor.screenshot({ path: path.join(OUT, `mobile-${key}-editing.png`) });

    await editor.getByText(t.cancel, { exact: true }).click();
    await page.waitForTimeout(200);
    check(key, 'Cancel closes it back to the badge', await badge.isVisible());
    check(key, 'Cancel sends nothing', (await page.evaluate(() => window.__calls.length)) === 0);

    await page.locator('[data-testid="eol-answered-toggle-1"]').click();
    await page.waitForTimeout(200);
    const ed2 = page.locator('div', { has: page.getByText(t.cancel, { exact: true }) }).filter({ hasText: '1. Software Update' }).last();
    await ed2.getByText(t.notOk, { exact: true }).click();
    await ed2.locator('textarea').first().fill('conta yırtık');
    await ed2.getByText(t.save, { exact: true }).click();
    await page.waitForTimeout(400);
    const rec = (await page.evaluate(() => window.__calls)).find((c) => c.name === 'recordChecklist');
    check(key, 'Save records the edited answer', rec && rec.args[3]?.status === 'NOT_OK' && rec.args[3]?.note === 'conta yırtık', JSON.stringify(rec?.args?.slice(2)));
    check(key, 'after Save the item is a badge again', await badge.isVisible());
    check(key, 'pending item 113 stays open (has Save)', (await page.locator('div', { has: page.getByText(t.save, { exact: true }) }).filter({ hasText: 'Şarj kapağı kontrolü' }).count()) > 0);
    check(key, 'no page errors', errors.length === 0, errors.join('; '));
    await page.close();
  }
}
await browser.close();
fs.rmSync(bundle, { recursive: true, force: true });
console.log(failed ? 'COLLAPSE CHECKS FAILED' : 'COLLAPSE CHECKS PASSED');
process.exit(failed ? 1 : 0);
