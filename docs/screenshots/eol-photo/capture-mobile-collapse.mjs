// EoL item cards (docs/16 A47, A49) on the react-native-web harness: real
// EOLChecklistScreen, stubbed API (nothing written). Every item is a framed
// card whose header row (number + name, status pill, chevron) is the only
// toggle; closed body = note, who/when, photos; open body = answer buttons,
// note box, photo pickers, Cancel + Save. Exit code 1 on any failure.
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from '../mobile-harness/build.mjs';
import { chromium } from '../../../web/node_modules/playwright/index.mjs';
import { scriptOutputDir } from '../lib/output-dir.mjs';

const OUT = scriptOutputDir(import.meta.url);
const bundle = await build(fs.mkdtempSync(path.join(os.tmpdir(), 'karea-eol-collapse-')));
const browser = await chromium.launch({ headless: true });
const L = {
  tr: { ok: 'Uygun', notOk: 'Uygun değil', pending: 'Bekliyor', note: 'Not: ölçüm 12.6', save: 'Kaydet', cancel: 'İptal', edit: 'Düzenle', close: 'Kapat' },
  en: { ok: 'OK', notOk: 'Not OK', pending: 'Pending', note: 'Note: ölçüm 12.6', save: 'Save', cancel: 'Cancel', edit: 'Edit', close: 'Close' },
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

    const header = page.locator('[data-testid="eol-item-header-1"]');
    const closed = page.locator('[data-testid="eol-answered-1"]');
    const text = await closed.innerText();
    check(key, 'answered item 1 starts closed', await closed.isVisible());
    check(key, 'header shows number + name and the answer pill', (await header.innerText()).includes('1. Araç kimliği ve varyant') && (await header.innerText()).includes(t.ok), JSON.stringify((await header.innerText()).split('\n')));
    check(key, 'header has a chevron icon', (await header.locator('svg:not([data-testid="eol-criteria-icon"] svg)').count()) === 1);
    check(key, 'closed header shows the criteria icon (item 1 has criteria)', (await header.locator('[data-testid="eol-criteria-icon"]').count()) === 1);
    check(key, 'header aria-expanded=false when closed', (await header.getAttribute('aria-expanded')) === 'false');
    check(key, 'no "Edit" label anywhere', !(await page.locator('#root').innerText()).split('\n').includes(t.edit));
    check(key, 'closed body shows the note', text.includes(t.note));
    check(key, 'closed body shows who/when', text.includes('Quality Operator'));
    check(key, 'closed body shows all 3 photos', (await closed.locator('[data-testid="checklist-item-photos"] img').count()) === 3);
    check(key, 'closed body has no editor (no Save)', !text.includes(t.save));
    const closedCount = await page.locator('[data-testid^="eol-answered-"]').count();
    check(key, 'every answered active item starts closed (items 1,2,3)', closedCount === 3, String(closedCount));
    const pendingHeader = page.locator('[data-testid="eol-item-header-113"]');
    check(key, 'pending item shows the pending pill', (await pendingHeader.innerText()).includes(t.pending), JSON.stringify((await pendingHeader.innerText()).split('\n')));
    check(key, 'pending item starts open', (await pendingHeader.getAttribute('aria-expanded')) === 'true');

    await closed.locator('[data-testid="checklist-item-photos"] img').first().click();
    await page.waitForTimeout(300);
    const viewerClose = page.getByText(t.close, { exact: true });
    check(key, 'photo tap opens its own viewer', (await viewerClose.count()) > 0);
    check(key, 'photo tap does not toggle the card', (await header.getAttribute('aria-expanded')) === 'false');
    await viewerClose.last().click();
    await page.waitForTimeout(300);

    const card = closed.locator('xpath=..');
    await closed.scrollIntoViewIfNeeded();
    await page.mouse.move(0, 0);
    await card.screenshot({ path: path.join(OUT, `mobile-${key}-badge.png`) });

    await header.click();
    await page.waitForTimeout(200);
    check(key, 'header tap opens the editor', !(await closed.count()) && (await header.getAttribute('aria-expanded')) === 'true');
    const editor = page.locator('div', { has: page.getByText(t.cancel, { exact: true }) }).filter({ hasText: '1. Araç kimliği ve varyant' }).last();
    const noteValue = await editor.locator('textarea').first().inputValue();
    check(key, 'editor prefilled with the saved note', noteValue === 'ölçüm 12.6', JSON.stringify(noteValue));
    check(key, 'open card still shows all 3 photos', (await editor.locator('[data-testid="checklist-item-photos"] img').count()) === 3);
    check(key, 'open card hides who/when', !(await editor.innerText()).includes('Quality Operator'));
    const cancelBox = await editor.getByText(t.cancel, { exact: true }).boundingBox();
    const saveBox = await editor.getByText(t.save, { exact: true }).boundingBox();
    check(key, 'Cancel and Save side by side, Save on the right', Math.abs(cancelBox.y - saveBox.y) < 4 && cancelBox.x < saveBox.x, `cancel(${Math.round(cancelBox.x)},${Math.round(cancelBox.y)}) save(${Math.round(saveBox.x)},${Math.round(saveBox.y)})`);
    await editor.scrollIntoViewIfNeeded();
    await page.mouse.move(0, 0);
    await editor.screenshot({ path: path.join(OUT, `mobile-${key}-editing.png`) });

    await header.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    check(key, 'Enter on the header closes it', (await header.getAttribute('aria-expanded')) === 'false');
    await header.focus();
    await page.keyboard.press(' ');
    await page.waitForTimeout(200);
    check(key, 'Space on the header opens it', (await header.getAttribute('aria-expanded')) === 'true');

    await editor.getByText(t.cancel, { exact: true }).click();
    await page.waitForTimeout(200);
    check(key, 'Cancel closes it back to the summary', await closed.isVisible());
    check(key, 'toggling and Cancel send nothing', (await page.evaluate(() => window.__calls.length)) === 0);

    await header.click();
    await page.waitForTimeout(200);
    const ed2 = page.locator('div', { has: page.getByText(t.cancel, { exact: true }) }).filter({ hasText: '1. Araç kimliği ve varyant' }).last();
    await ed2.getByText(t.notOk, { exact: true }).click();
    await ed2.locator('textarea').first().fill('conta yırtık');
    await ed2.getByText(t.save, { exact: true }).click();
    await page.waitForTimeout(400);
    const rec = (await page.evaluate(() => window.__calls)).find((c) => c.name === 'recordChecklist');
    check(key, 'Save records the edited answer', rec && rec.args[3]?.status === 'NOT_OK' && rec.args[3]?.note === 'conta yırtık', JSON.stringify(rec?.args?.slice(2)));
    check(key, 'after Save the item is closed again', await closed.isVisible());
    check(key, 'no page errors', errors.length === 0, errors.join('; '));
    await page.close();
  }
}
await browser.close();
fs.rmSync(bundle, { recursive: true, force: true });
console.log(failed ? 'COLLAPSE CHECKS FAILED' : 'COLLAPSE CHECKS PASSED');
process.exit(failed ? 1 : 0);
