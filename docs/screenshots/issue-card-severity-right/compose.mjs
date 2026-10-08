/**
 * Side-by-side proof: the same record's card on the Issues list (left) and
 * the vehicle-detail issue list (right), per platform and width, plus the
 * card-relative positions of status, severity bars and the VIN/time row for
 * every record. Reads the crops/facts written by capture-web.mjs (web/after)
 * and the mobile harness (mobile/after, run with CARD_TEXT="Arka tampon").
 *
 *   node compose.mjs   → compare/*.png and compare/compare.txt
 * Exits non-zero if any record's positions differ between the two screens.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../../../web/node_modules/playwright/index.mjs';
import { outputDir } from '../lib/output-dir.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = outputDir(path.join(here, 'compare'));
fs.mkdirSync(outDir, { recursive: true });

const platforms = [
  { name: 'web', dir: 'web/after', issues: 'issues', vehicle: 'vehicle' },
  { name: 'mobile', dir: 'mobile/after', issues: 'issues-list', vehicle: 'vehicle-issues' },
];
const widths = [375, 390, 430, 1280];
const locales = ['tr', 'en'];

// Card-relative geometry; equal numbers mean the same layout.
function geometry(c) {
  const r = (n) => Math.round(n * 10) / 10;
  return {
    status_from_right: r(c.box.right - c.status.right),
    status_from_body_top: r(c.status.top - c.body_top),
    bars_below_status: r(c.bars.top - c.status.bottom),
    bars_right_vs_status: r(c.status.right - c.bars.right),
    meta_from_left: r(c.meta.left - c.box.left),
    meta_from_bottom: r(c.box.bottom - c.meta.bottom),
  };
}
// First line that is not the empty-photo placeholder = the description.
const PLACEHOLDER = /^(Fotoğraf( yok)?|yok|No photo|HEIC|…)$/;
const recordKey = (c) =>
  c.text.split('\n').map((l) => l.trim()).find((l) => l && !PLACEHOLDER.test(l)).slice(0, 14);

const lines = [];
let mismatches = 0;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 600 }, deviceScaleFactor: 1 });

for (const p of platforms) {
  const facts = JSON.parse(fs.readFileSync(path.join(outputDir(path.join(here, p.dir)), 'facts.json'), 'utf8'));
  const cardsOf = (k) => (facts[k].cards ?? facts[k].issue_cards);
  for (const locale of locales) {
    for (const width of widths) {
      const a = cardsOf(`${p.issues}-${locale}-${width}`);
      const b = cardsOf(`${p.vehicle}-${locale}-${width}`);
      for (const ca of a) {
        const cb = b.find((x) => recordKey(x) === recordKey(ca));
        const ga = JSON.stringify(geometry(ca));
        const gb = cb ? JSON.stringify(geometry(cb)) : 'missing';
        const same = ga === gb;
        if (!same) mismatches++;
        lines.push(`${p.name} ${locale} ${width}px "${recordKey(ca)}" issues=${ga} vehicle=${gb} ${same ? 'SAME' : 'DIFF'}`);
      }
      if (locale !== 'tr' && width !== 375) continue;
      const img = (screen) =>
        fs.readFileSync(path.join(outputDir(path.join(here, p.dir)), `${screen}-${locale}-${width}-card.png`)).toString('base64');
      const side = (title, screen) => `
        <figure style="margin:0;display:flex;flex-direction:column;gap:8px;align-items:flex-start">
          <figcaption style="font:600 15px system-ui">${title}</figcaption>
          <img src="data:image/png;base64,${img(screen)}" style="width:${width >= 1280 ? 320 : width - 32}px;border:1px dashed #bbb"/>
        </figure>`;
      await page.setContent(`<body style="margin:0;padding:16px;background:#fff;display:inline-block">
        <div style="font:700 16px system-ui;margin-bottom:12px">${p.name} · ${locale} · ${width}px — ${width >= 1280 ? 'ızgara (fotoğraf üstte)' : 'sıkışık (fotoğraf solda)'}</div>
        <div style="display:flex;gap:24px;align-items:flex-start">
          ${side('Issues listesi', p.issues)}
          ${side('Araç detayı › Issues', p.vehicle)}
        </div></body>`);
      await page.waitForFunction(() => [...document.images].every((i) => i.complete));
      await page.locator('body').screenshot({ path: path.join(outDir, `${p.name}-${locale}-${width}.png`) });
    }
  }
}

await browser.close();
lines.push(`mismatches=${mismatches}`);
fs.writeFileSync(path.join(outDir, 'compare.txt'), `${lines.join('\n')}\n`);
console.log(lines.slice(0, 6).join('\n'));
console.log(`... ${lines.length - 1} records compared, mismatches=${mismatches}`);
if (mismatches) process.exit(1);
