/**
 * Web: Issues board and vehicle-detail issue tab with the same fixture issues.
 * Every API call is answered from fixtures (page.route) with a fake session,
 * so no backend login and no database access happen.
 *
 *   WEB_BASE=http://localhost:5173 node capture-web.mjs <before|after>
 * Writes web/<prefix>/<screen>-<locale>-<width>.png, a crop of the long card
 * (<screen>-<locale>-<width>-card.png) and web/<prefix>/facts.json.
 * With prefix "after" it exits non-zero on overflow, visible severity text,
 * a missing screen-reader label or a card whose corners do not match.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../../../web/node_modules/playwright/index.mjs';
import { outputDir } from '../lib/output-dir.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const prefix = process.argv[2] ?? 'after';
const outDir = outputDir(path.join(here, 'web', prefix));
const WEB = process.env.WEB_BASE || 'http://localhost:5173';
const VIN = 'KAREA0LAYOUT00042';
const HOUR = 3_600_000;
const ago = (h) => new Date(Date.now() - h * HOUR).toISOString();
const PHOTO_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="192" height="144"><rect width="192" height="144" fill="#8E9E7C"/><circle cx="96" cy="72" r="40" fill="#C0A89B"/></svg>';

const issue = (id, severity, status, description, h, extra = {}) => ({
  ID: id, VIN, SourceType: 'STATION', IssueReporterID: 1,
  Severity: severity, Status: status, Description: description, IssueDate: ago(h), ...extra,
});
// Same records as the mobile harness scenes (issues-list / vehicle-issues).
const issues = [
  issue(101, 'CRITICAL', 'OPEN', 'Sol ön kapı menteşesinde boşluk', 50, {
    ReportPhotoPath: 'fixtures/photo.svg', DefectPartID: 1, DefectTypeID: 1,
    DefectPartNameTR: 'Ön kapı', DefectPartNameEN: 'Front door', DefectTypeNameTR: 'Boşluk', DefectTypeNameEN: 'Gap',
  }),
  issue(102, 'MEDIUM', 'CONDITIONAL_APPROVED',
    'Arka tampon sağ alt köşesinde boya akıntısı ve hafif portakallanma, müşteri görünür bölgede, tekrar boya kabinine gönderilmeli mi değerlendirilecek',
    30, {
      ConditionalApproveDate: ago(4), DefectPartID: 99, DefectTypeID: 99,
      CustomPartName: 'Arka tampon sağ alt köşe bağlantı braketi ve plastik koruma kapağı montaj bölgesi',
      CustomDefectName: 'Boya akıntısı / portakallanma / renk tonu farkı',
    }),
  issue(103, 'LOW', 'APPROVED', 'Torpido kapağı hafif gıcırtı', 6, {
    ApproveDate: ago(1), DefectPartID: 2, DefectTypeID: 2,
    DefectPartNameTR: 'Torpido', DefectPartNameEN: 'Glovebox', DefectTypeNameTR: 'Ses', DefectTypeNameEN: 'Noise',
  }),
  issue(104, 'MEDIUM', 'IN_PROGRESS', 'Bagaj contası tam oturmuyor', 0.3),
  issue(105, 'CRITICAL', 'DONE',
    'Soğutmasuyupompagövdesibağlantısızdırmazlıkcontasıkontrolü_uzun_kelime_bölünmeden_devam_ediyor ve ardından normal cümle',
    75, { ReportPhotoPath: 'fixtures/photo.svg' }),
];
const vehicle = {
  VIN, VehicleModelID: 1, CurrentGlobalStatus: 'IN_PRODUCTION', CurrentEOLStage: null,
  CurrentStationID: 2, TotalProgressPercentage: 38,
};

const session = {
  token: 'fixture-token',
  user: { ID: 1, FullName: 'Layout Fixture', Email: 'fixture@karea.local', Role: 'MANAGER_ADMIN', IsActive: true },
  permissions: [
    'web.access', 'vehicle.view', 'station.step.edit', 'issue.view', 'issue.create',
    'checklist.shipment.view', 'checklist.test.view', 'checklist.eol.view',
  ],
};

function respond(url) {
  const p = new URL(url).pathname.replace(/^\/api\/v1/, '');
  if (p === `/vehicles/${VIN}`) return vehicle;
  if (p === `/vehicles/${VIN}/station-steps`) return { Items: [], OpenIssuesByStation: {} };
  if (p === '/issues') return { items: issues, has_more: false };
  if (p === `/vehicles/${VIN}/shipment-readiness`) return null;
  return { items: [], Items: [] };
}

// Runs in the page: layout facts for every issue card.
function cardFacts() {
  const rect = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: r.top, right: r.right, bottom: r.bottom, left: r.left };
  };
  return [...document.querySelectorAll('article')].map((card) => {
    const box = card.getBoundingClientRect();
    const sev = card.querySelector('[data-severity-bars]');
    const status = rect(card.querySelector('[data-testid="issue-card-status"]'));
    const bars = rect(sev);
    const meta = rect(card.querySelector('[data-testid="issue-card-meta"]'));
    const outside = [...card.querySelectorAll('*')].filter((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || el.closest('.sr-only')) return false;
      return r.right > box.right + 1 || r.left < box.left - 1 || r.bottom > box.bottom + 1 || r.top < box.top - 1;
    }).length;
    // Grid cards start the text body under the photo.
    const photo = card.querySelector('[data-testid="issue-card-photo"]').getBoundingClientRect();
    const bodyTop = photo.right < box.right - 1 ? box.top : photo.bottom;
    const layout = status && bars && meta
      ? {
          status_top_right: status.top - bodyTop <= 16 && status.right >= meta.right - 1,
          severity_below_status: bars.top >= status.bottom - 0.5 && bars.top - status.bottom <= 12,
          severity_right_aligned: Math.abs(bars.right - status.right) <= 1.5,
          meta_bottom_left: meta.left < status.left && meta.top > status.bottom,
        }
      : null;
    return {
      text: card.innerText,
      severity_word_visible: /\b(Kritik|Orta|Düşük|Critical|Medium|Low)\b/.test(card.innerText),
      severity_aria: sev ? sev.getAttribute('aria-label') : null,
      severity_role: sev ? sev.getAttribute('role') : null,
      severity_aria_hidden: sev ? sev.getAttribute('aria-hidden') : null,
      outside,
      box: rect(card),
      body_top: bodyTop,
      status,
      bars,
      meta,
      layout,
    };
  });
}

fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const facts = {};
let failed = false;

async function capture(screen, route, locale, width) {
  const context = await browser.newContext({ viewport: { width, height: 1400 }, deviceScaleFactor: 2 });
  await context.addInitScript(([s, loc]) => {
    localStorage.setItem('karea.auth.session', JSON.stringify(s));
    localStorage.setItem('karea-locale', loc);
    localStorage.setItem('karea-theme-mode', 'light');
  }, [session, locale]);
  const page = await context.newPage();
  await page.route('**/*', (r) => {
    const url = r.request().url();
    if (url.includes('/uploads/')) {
      return r.fulfill({ status: 200, contentType: 'image/svg+xml', body: PHOTO_SVG });
    }
    if (!url.includes('/api/v1/')) return r.continue();
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(respond(url)) });
  });
  await page.goto(`${WEB}${route}`);
  await page.getByText('Sol ön kapı').first().waitFor({ timeout: 20_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
  const key = `${screen}-${locale}-${width}`;
  const cards = await page.evaluate(cardFacts);
  const docOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  facts[key] = { docOverflow, cards };
  const layoutOk = cards.filter((c) => c.layout && !Object.values(c.layout).includes(false)).length;
  console.log(
    `${prefix} ${key} cards=${cards.length} docOverflow=${docOverflow}` +
      ` sevText=${cards.filter((c) => c.severity_word_visible).length}` +
      ` aria=${cards.map((c) => c.severity_aria).join('|')}` +
      ` layoutOk=${layoutOk} cardOverflow=${cards.reduce((n, c) => n + c.outside, 0)}`,
  );
  if (prefix === 'after' && (docOverflow || cards.length !== issues.length || layoutOk !== cards.length ||
    cards.some((c) => c.severity_word_visible || !c.severity_aria || c.severity_role !== 'img' || c.outside))) {
    failed = true;
  }
  await page.screenshot({ path: path.join(outDir, `${key}.png`) });
  await page.locator('article', { hasText: 'Arka tampon' }).screenshot({ path: path.join(outDir, `${key}-card.png`) });
  await context.close();
}

for (const locale of ['tr', 'en']) {
  for (const width of [375, 390, 430, 1280]) {
    await capture('issues', '/issues', locale, width);
    await capture('vehicle', `/vehicles/${VIN}?tab=issues`, locale, width);
  }
}

await browser.close();
fs.writeFileSync(path.join(outDir, 'facts.json'), JSON.stringify(facts, null, 1));
if (failed) {
  console.error('web capture: FAILED');
  process.exit(1);
}
