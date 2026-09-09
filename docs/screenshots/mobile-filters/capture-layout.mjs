/**
 * Layout QA for Issues filter row (Type | Severity) at phone widths.
 * Mirrors MyIssuesScreen flex rules — not a full app render.
 */
import { chromium } from '../../../web/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = __dirname;
fs.mkdirSync(OUT, { recursive: true });

const themes = {
  light: {
    bg: '#F7F9FB',
    surface: '#FFFFFF',
    border: '#D0D5DB',
    text: '#0B0F14',
    muted: '#5B6672',
    chip: '#E8ECF0',
  },
  dark: {
    bg: '#0B0F14',
    surface: '#151B22',
    border: '#2A3340',
    text: '#F3F5F7',
    muted: '#9AA3AD',
    chip: '#1E2630',
  },
};

function pageHtml(themeKey, width) {
  const c = themes[themeKey];
  return `<!doctype html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, system-ui, sans-serif; background: ${c.bg}; color: ${c.text}; }
  .wrap { width: ${width}px; margin: 0 auto; padding: 16px; background: ${c.bg}; }
  .row { display: flex; flex-wrap: wrap; align-items: flex-start; column-gap: 16px; row-gap: 10px; margin-top: 12px; }
  .type { flex: 1 1 168px; min-width: 140px; }
  .sev { flex: 0 0 auto; }
  .label { color: ${c.muted}; font-weight: 600; font-size: 13px; margin: 0 0 6px; }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .chip { min-height: 44px; padding: 0 12px; border-radius: 999px; background: ${c.chip}; display: flex; align-items: center; font-size: 12px; font-weight: 600; }
  .sev-chip { min-height: 44px; min-width: 44px; border-radius: 999px; display: flex; align-items: center; justify-content: center; }
  .bars { display: flex; align-items: flex-end; gap: 2px; height: 14px; }
  .bar { width: 3px; border-radius: 1px; background: #B5B2B2; }
  .bar.on1 { background: #327CB2; }
  .bar.on2 { background: #EAB308; }
  .bar.on3 { background: #C62222; }
  .status-label { color: ${c.muted}; font-weight: 600; font-size: 13px; margin: 12px 0 6px; }
  .status .chip { border: 1px solid ${c.border}; background: ${c.surface}; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .meta { color: ${c.muted}; font-size: 12px; margin-bottom: 8px; }
</style></head><body><div class="wrap">
  <h1>Issues filters</h1>
  <div class="meta">${themeKey} · ${width}px</div>
  <div class="row">
    <div class="type">
      <div class="label">Tür</div>
      <div class="chips">
        <div class="chip">Hata</div>
        <div class="chip">Tamir Gerekiyor</div>
      </div>
    </div>
    <div class="sev">
      <div class="label">Severity</div>
      <div class="chips">
        <div class="sev-chip"><div class="bars"><div class="bar on3" style="height:6px"></div><div class="bar on3" style="height:10px"></div><div class="bar on3" style="height:14px"></div></div></div>
        <div class="sev-chip"><div class="bars"><div class="bar on2" style="height:6px"></div><div class="bar on2" style="height:10px"></div><div class="bar" style="height:14px"></div></div></div>
        <div class="sev-chip"><div class="bars"><div class="bar on1" style="height:6px"></div><div class="bar" style="height:10px"></div><div class="bar" style="height:14px"></div></div></div>
      </div>
    </div>
  </div>
  <div class="status-label">Durum</div>
  <div class="chips status">
    <div class="chip">Açık</div>
    <div class="chip">İşlemde</div>
    <div class="chip">Tamamlandı</div>
    <div class="chip">Kalite Onay</div>
  </div>
</div></body></html>`;
}

const browser = await chromium.launch({ headless: true });
const cases = [
  ['light', 390],
  ['dark', 390],
  ['light', 320],
  ['dark', 320],
];

for (const [theme, width] of cases) {
  const page = await browser.newPage({
    viewport: { width: width + 32, height: 420 },
    deviceScaleFactor: 2,
  });
  await page.setContent(pageHtml(theme, width));
  const out = path.join(OUT, `filters-${theme}-${width}.png`);
  await page.screenshot({ path: out });
  console.log('wrote', out);
  await page.close();
}

await browser.close();
