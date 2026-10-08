// Issue list opening-date filter (docs/16 A57) in the browser, against the
// test API on :18081 / karea_eolnote_test with the TMP-DATEFILTER fixtures of
// run-verification.py (plant day 2026-10-08). Never live, never :8080.
//
// Every expected set comes from SQL: (issue_date AT TIME ZONE
// 'Europe/Istanbul')::date. The board set is read from the page's own
// paged /issues responses (scrolled to the end); CSV and ZIP from the
// downloaded files; print from the rows in the print root when
// window.print fires.
//
//   TR 1280  presets + URL + reload, custom range (57 rows > one page),
//            start only, end only, VIN + severity + status combined,
//            empty range; CSV / ZIP / print rows = on-screen total
//   TR/EN 1280/375  custom range + empty range screenshots and counts
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { chromium } from '../../../web/node_modules/playwright/index.mjs';
import { scriptOutputDir } from '../lib/output-dir.mjs';

const OUT = scriptOutputDir(import.meta.url);
const BASE = 'http://localhost:5175';
const API = 'http://localhost:18081/api/v1';
const DB = 'postgres://karea:karea_secret@localhost:5432/karea_eolnote_test?sslmode=disable';
const PSQL = '/opt/homebrew/opt/libpq/bin/psql';
const VIN = 'N7V1K1SA2TK000004';

let failed = false;
const check = (label, ok, detail = '') => {
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed = true;
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sorted = (ids) => [...ids].sort((a, b) => a - b);

const sql = (q) => execFileSync(PSQL, [DB, '-X', '-At', '-c', q], { encoding: 'utf8' }).trim();
const day = (cond) => `(issue_date AT TIME ZONE 'Europe/Istanbul')::date ${cond}`;
const expected = (where) =>
  sql(`SELECT id FROM issue_list WHERE ${where} ORDER BY id`).split('\n').filter(Boolean).map(Number);

const today = sql(`SELECT (now() AT TIME ZONE 'Europe/Istanbul')::date`);
if (today !== '2026-10-08') throw new Error(`plant day is ${today}; fixtures are built for 2026-10-08`);
if (sql(`SELECT count(*) FROM issue_list WHERE description LIKE 'TMP-DATEFILTER%'`) !== '64') {
  throw new Error('run `python3 run-verification.py fixtures` first');
}

const EXPECT = {
  today: expected(day(`= '2026-10-08'`)),
  '7d': expected(day(`BETWEEN '2026-10-02' AND '2026-10-08'`)),
  month: expected(day(`BETWEEN '2026-10-01' AND '2026-10-08'`)),
  custom: expected(day(`BETWEEN '2026-09-28' AND '2026-09-30'`)),
  fromOnly: expected(day(`>= '2026-10-01'`)),
  toOnly: expected(day(`<= '2026-09-30'`)),
  combined: expected(`${day(`BETWEEN '2026-10-02' AND '2026-10-08'`)} AND vin = '${VIN}' AND severity = 'CRITICAL' AND status = 'OPEN'`),
  empty: expected(day(`BETWEEN '2026-08-01' AND '2026-08-02'`)),
};

const session = await (await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'manager@karea.local', password: 'changeme123' }),
})).json();

const browser = await chromium.launch({ headless: true });

async function openPage(locale, width) {
  const context = await browser.newContext({
    viewport: { width, height: width < 600 ? 900 : 1000 },
    deviceScaleFactor: 1,
    acceptDownloads: true,
  });
  await context.addInitScript((data) => {
    localStorage.setItem('karea.auth.session', JSON.stringify(data.session));
    localStorage.setItem('karea-theme-mode', 'light');
    localStorage.setItem('karea-locale', data.locale);
    window.print = () => {
      const root = document.querySelector('.print-root[data-print-id="issues-list"]');
      const ids = [...root.querySelectorAll('tbody tr')].map((tr) =>
        Number([...tr.cells].map((c) => c.textContent.trim()).find((x) => /^#\d+$/.test(x)).slice(1)));
      window.__printed = { ids, header: root.querySelector('table').previousElementSibling?.innerText ?? '' };
    };
  }, { session: { token: session.token, user: session.user, permissions: session.permissions }, locale });
  const page = await context.newPage();
  const board = [];
  page.on('response', async (res) => {
    const u = new URL(res.url());
    if (!u.pathname.endsWith('/api/v1/issues') || !u.searchParams.has('limit')) return;
    try {
      board.push({ query: u.search, ids: ((await res.json()).items ?? []).map((i) => i.ID) });
    } catch { /* navigation cancelled the body */ }
  });
  return { page, context, board };
}

const csvButton = (page) => page.getByRole('button', { name: /^CSV \(/ });

/** The on-screen total from the CSV button once counting has settled. */
async function screenTotal(page) {
  await page.waitForFunction(() =>
    [...document.querySelectorAll('button')].some((b) => /^CSV \(\d+\)$/.test(b.textContent.trim())), null,
  { timeout: 15000 });
  await page.waitForLoadState('networkidle');
  return Number((await csvButton(page).innerText()).match(/\((\d+)\)/)[1]);
}

/** Board ids: scroll the app until no page is pending; keep responses for `opened` params. */
async function boardIds(page, board, mark) {
  for (let i = 0; i < 10; i++) {
    await page.evaluate(() => {
      const el = document.querySelector('[data-app-scroll]');
      el.scrollTop = el.scrollHeight;
    });
    await page.waitForTimeout(250);
    await page.waitForLoadState('networkidle');
  }
  await page.evaluate(() => { document.querySelector('[data-app-scroll]').scrollTop = 0; });
  const range = (q) => {
    const p = new URLSearchParams(q);
    return `${p.get('opened_from')}|${p.get('opened_to')}|${p.get('status')}`;
  };
  const responses = board.slice(mark);
  const current = range(responses.at(-1)?.query ?? '');
  const ids = new Set();
  for (const r of responses) if (range(r.query) === current) r.ids.forEach((id) => ids.add(id));
  return sorted(ids);
}

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  return rows;
}
const csvIds = (text) => parseCsv(text.replace(/^\uFEFF/, '')).slice(1).map((r) => Number(r[0]));

async function download(page, name, file) {
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 60000 }),
    page.getByRole('button', { name }).click(),
  ]);
  const to = path.join(OUT, file);
  await dl.saveAs(to);
  return to;
}

async function exports(page, label, total, want, file) {
  const csv = await download(page, /^CSV \(/, `${file}.csv`);
  const fromCsv = csvIds(fs.readFileSync(csv, 'utf8'));
  const zip = await download(page, /^ZIP \(/, `${file}.zip`);
  const fromZip = csvIds(execFileSync('unzip', ['-p', zip, 'issues.csv'], { encoding: 'utf8' }));
  await page.evaluate(() => { window.__printed = null; });
  await page.getByRole('button', { name: /^(Yazdır|Print) \(/ }).click();
  await page.waitForFunction(() => window.__printed, null, { timeout: 30000 });
  const printed = await page.evaluate(() => window.__printed);
  check(`${label}: CSV rows = on-screen ${total}`, fromCsv.length === total && same(sorted(fromCsv), want),
    `${fromCsv.length} rows`);
  check(`${label}: ZIP issues.csv rows = on-screen ${total}`, fromZip.length === total && same(sorted(fromZip), want),
    `${fromZip.length} rows`);
  check(`${label}: print rows = on-screen ${total}`, printed.ids.length === total && same(sorted(printed.ids), want),
    `${printed.ids.length} rows`);
  return printed;
}

async function shot(page, file) {
  await page.evaluate(() => { document.querySelector('[data-app-scroll]').scrollTop = 0; });
  await page.screenshot({ path: path.join(OUT, file) });
}

// ------------------------------------------------------------ TR 1280 flows
console.log('== TR 1280: presets, URL, combined filters, exports ==');
{
  const { page, context, board } = await openPage('tr', 1280);
  await page.goto(`${BASE}/issues`, { waitUntil: 'networkidle' });
  await screenTotal(page);

  for (const [preset, label] of [['today', 'Bugün'], ['7d', 'Son 7 gün'], ['month', 'Bu ay']]) {
    const mark = board.length;
    await page.getByTestId(`issue-opened-${preset}`).click();
    await page.waitForURL((u) => u.searchParams.get('opened') === preset);
    const total = await screenTotal(page);
    const ids = await boardIds(page, board, mark);
    check(`${label}: URL opened=${preset}, board = SQL (${EXPECT[preset].length})`,
      total === EXPECT[preset].length && same(ids, EXPECT[preset]), `screen ${total}, board ${ids.length}`);
  }
  await page.reload({ waitUntil: 'networkidle' });
  const afterReload = await screenTotal(page);
  check('reload keeps opened=month (chip pressed, same total)',
    new URL(page.url()).searchParams.get('opened') === 'month'
      && (await page.getByTestId('issue-opened-month').getAttribute('aria-pressed')) === 'true'
      && afterReload === EXPECT.month.length, page.url().replace(BASE, ''));
  await exports(page, 'Bu ay', afterReload, EXPECT.month, 'tr-1280-month');

  // custom range typed into the date inputs
  let mark = board.length;
  await page.getByTestId('issue-opened-from').fill('2026-09-28');
  await page.getByTestId('issue-opened-to').fill('2026-09-30');
  await page.waitForURL((u) => u.searchParams.get('opened_from') === '2026-09-28'
    && u.searchParams.get('opened_to') === '2026-09-30');
  check('typing a day drops the preset from the URL', !new URL(page.url()).searchParams.has('opened'), page.url().replace(BASE, ''));
  let total = await screenTotal(page);
  const firstPage = board.slice(mark).filter((r) => r.query.includes('opened_from=2026-09-28')).at(-1);
  let ids = await boardIds(page, board, mark);
  check(`28.09–30.09: board = SQL (${EXPECT.custom.length}, first page ${firstPage?.ids.length})`,
    total === EXPECT.custom.length && same(ids, EXPECT.custom), `screen ${total}, board ${ids.length}`);
  await shot(page, 'tr-1280-custom.png');
  const printed = await exports(page, '28.09–30.09', total, EXPECT.custom, 'tr-1280-custom');
  check('print header names the range', printed.header.includes('Açılış tarihi: 28.09.2026 – 30.09.2026'),
    printed.header.split('\n').find((l) => l.includes('Açılış')) ?? printed.header);

  for (const [label, query, key, file] of [
    ['yalnız başlangıç 01.10', 'opened_from=2026-10-01', 'fromOnly', 'tr-1280-from-only'],
    ['yalnız bitiş 30.09', 'opened_to=2026-09-30', 'toOnly', 'tr-1280-to-only'],
  ]) {
    mark = board.length;
    await page.goto(`${BASE}/issues?${query}`, { waitUntil: 'networkidle' });
    total = await screenTotal(page);
    ids = await boardIds(page, board, mark);
    check(`${label}: board = SQL (${EXPECT[key].length})`, total === EXPECT[key].length && same(ids, EXPECT[key]),
      `screen ${total}, board ${ids.length}`);
    await shot(page, `${file}.png`);
    await exports(page, label, total, EXPECT[key], file);
  }

  // combined with VIN search, severity and status (client filters on server-cut rows)
  await page.goto(`${BASE}/issues?opened=7d`, { waitUntil: 'networkidle' });
  await page.getByRole('searchbox').fill(VIN);
  await page.getByRole('button', { name: 'Kritik', exact: true }).click();
  await page.getByRole('button', { name: 'Açık', exact: true }).click();
  await page.waitForTimeout(400);
  total = await screenTotal(page);
  check(`Son 7 gün + VIN + Kritik + Açık = SQL (${EXPECT.combined.length})`, total === EXPECT.combined.length,
    `screen ${total}`);
  await shot(page, 'tr-1280-combined.png');
  const combo = await exports(page, 'birleşik filtre', total, EXPECT.combined, 'tr-1280-combined');
  check('print header lists every filter',
    ['Arama', 'Kritik', 'Açık', 'Açılış tarihi: Son 7 gün'].every((s) => combo.header.includes(s)),
    combo.header.split('\n').find((l) => l.includes('Filtre')) ?? combo.header);
  await page.getByRole('button', { name: 'Açık', exact: true }).click();
  await page.getByRole('button', { name: 'Kritik', exact: true }).click();
  await page.getByRole('searchbox').fill('');

  await page.goto(`${BASE}/issues?opened_from=2026-08-01&opened_to=2026-08-02`, { waitUntil: 'networkidle' });
  total = await screenTotal(page);
  const msg = 'Seçilen açılış tarihi aralığında (01.08.2026 – 02.08.2026) filtrelere uyan arıza yok.';
  check('empty range: message names the range, exports disabled',
    total === 0 && await page.getByText(msg).isVisible() && await csvButton(page).isDisabled(), `screen ${total}`);
  await context.close();
}

// ------------------------------------------------- TR/EN x 1280/375 screens
console.log('== TR/EN 1280/375: custom range + empty range ==');
const EMPTY = {
  tr: 'Seçilen açılış tarihi aralığında (01.08.2026 – 02.08.2026) filtrelere uyan arıza yok.',
  en: 'No issues in the selected opening-date range (01/08/2026 – 02/08/2026) match the filters.',
};
for (const locale of ['tr', 'en']) {
  for (const width of [1280, 375]) {
    const tag = `${locale} ${width}`;
    const { page, context, board } = await openPage(locale, width);
    let mark = board.length;
    await page.goto(`${BASE}/issues?opened_from=2026-09-28&opened_to=2026-09-30`, { waitUntil: 'networkidle' });
    let total = await screenTotal(page);
    const ids = await boardIds(page, board, mark);
    if (width < 600) {
      await page.getByRole('button', { name: locale === 'tr' ? 'Filtreler' : 'Filters', exact: true }).click();
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    check(`${tag}: 28.09–30.09 board = SQL (${EXPECT.custom.length}), no horizontal overflow`,
      total === EXPECT.custom.length && same(ids, EXPECT.custom) && !overflow,
      `screen ${total}, board ${ids.length}`);
    await shot(page, `${locale}-${width}-custom.png`);

    await page.goto(`${BASE}/issues?opened_from=2026-08-01&opened_to=2026-08-02`, { waitUntil: 'networkidle' });
    total = await screenTotal(page);
    check(`${tag}: empty range message`, total === 0 && await page.getByText(EMPTY[locale]).isVisible());
    await shot(page, `${locale}-${width}-empty.png`);

    await page.goto(`${BASE}/issues?opened=today`, { waitUntil: 'networkidle' });
    total = await screenTotal(page);
    check(`${tag}: Bugün = SQL (${EXPECT.today.length})`, total === EXPECT.today.length);
    if (width < 600) {
      await page.getByRole('button', { name: locale === 'tr' ? 'Filtreler' : 'Filters', exact: true }).click();
    }
    await shot(page, `${locale}-${width}-today.png`);
    await context.close();
  }
}

await browser.close();
console.log(failed ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
process.exit(failed ? 1 : 0);
