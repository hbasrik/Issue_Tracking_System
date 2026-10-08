// Same day range on the issue board and on the Analysis page (docs/16 A60),
// against the test API on :18081 / karea_eolnote_test with the TMP-PLANTDAY
// fixtures of compare.py. Never live, never :8080.
//
// Board: the on-screen total (CSV (n) button). Analysis: the "Açılan hatalar"
// row of the page's own CSV export and the dashboard response the page
// rendered (WorkSplit = completed + ongoing donut; cumulative opened line =
// sum of Sparklines.Opened). All must equal the SQL plant-day count.
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

if (sql(`SELECT count(*) FROM issue_list WHERE description LIKE 'TMP-PLANTDAY%'`) !== '7') {
  throw new Error('run `python3 compare.py fixtures` first');
}

function sql(q) {
  return execFileSync(PSQL, [DB, '-X', '-At', '-c', q], { encoding: 'utf8' }).trim();
}
const plantCount = (from, to) => Number(sql(`SELECT count(*) FROM issue_list
  WHERE (issue_date AT TIME ZONE 'Europe/Istanbul')::date BETWEEN '${from}' AND '${to}'`));

let failed = false;
const check = (label, ok, detail = '') => {
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed = true;
};

const session = await (await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'manager@karea.local', password: 'changeme123' }),
})).json();

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, acceptDownloads: true });
await context.addInitScript((data) => {
  localStorage.setItem('karea.auth.session', JSON.stringify(data));
  localStorage.setItem('karea-theme-mode', 'light');
  localStorage.setItem('karea-locale', 'tr');
}, { token: session.token, user: session.user, permissions: session.permissions });
const page = await context.newPage();

async function boardTotal(from, to) {
  await page.goto(`${BASE}/issues?opened_from=${from}&opened_to=${to}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() =>
    [...document.querySelectorAll('button')].some((b) => /^CSV \(\d+\)$/.test(b.textContent.trim())), null,
  { timeout: 15000 });
  const text = await page.getByRole('button', { name: /^CSV \(\d+\)$/ }).innerText();
  return Number(text.match(/\((\d+)\)/)[1]);
}

async function analysisNumbers(from, to) {
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/analysis/dashboard') && r.url().includes(`from=${from}`), { timeout: 20000 }),
    page.goto(`${BASE}/analysis?from=${from}&to=${to}`),
  ]);
  const dash = await res.json();
  await page.waitForLoadState('networkidle');
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'CSV dışa aktar' }).click(),
  ]);
  const file = path.join(OUT, `analysis-${from}-${to}.csv`);
  await dl.saveAs(file);
  const row = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)
    .find((l) => l.startsWith('Açılan hatalar') || l.startsWith('"Açılan hatalar"'));
  fs.rmSync(file);
  return {
    csvOpened: Number(row.split(',')[1].replace(/"/g, '')),
    donut: dash.WorkSplit.Completed + dash.WorkSplit.Ongoing,
    cumulative: (dash.Sparklines.Opened ?? []).reduce((s, d) => s + d.CompletedCount, 0),
    days: Object.fromEntries((dash.Sparklines.Opened ?? []).map((d) => [d.Day.slice(0, 10), d.CompletedCount])),
  };
}

console.log('== issue board vs Analysis, TR 1280 ==');
for (const [from, to, shot] of [
  ['2026-09-15', '2026-09-16', true],
  ['2026-09-15', '2026-09-15', false],
  ['2026-09-16', '2026-09-16', false],
  ['2026-10-01', '2026-10-08', false],
]) {
  const want = plantCount(from, to);
  const board = await boardTotal(from, to);
  if (shot) await page.screenshot({ path: path.join(OUT, `board-${from}-${to}.png`) });
  const a = await analysisNumbers(from, to);
  if (shot) await page.screenshot({ path: path.join(OUT, `analysis-${from}-${to}.png`), fullPage: false });
  check(`${from} – ${to}: board ${board} = analysis CSV ${a.csvOpened} = donut ${a.donut} = cumulative ${a.cumulative} = SQL ${want}`,
    [board, a.csvOpened, a.donut, a.cumulative].every((n) => n === want), JSON.stringify(a.days));
}

await browser.close();
console.log(failed ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
process.exit(failed ? 1 : 0);
