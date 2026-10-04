// Activity page with management audit rows, against the test API on
// karea_admin_test (never the live DB). Writes web-*.png + web-facts.json,
// checks each new event-type filter and the viewer's hidden user/role types,
// and scans the rendered table text for raw stored values.
// Run after `run-verification.py api` (it creates the viewer account).
import { chromium } from '../../../web/node_modules/playwright/index.mjs';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const OUT = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE ?? 'http://localhost:5175';
const API = process.env.API ?? 'http://localhost:18081/api/v1';
const RAW = [
  /\b[A-Z]{2,}(?:_[A-Z0-9]+)+\b/g, // USER_ADMIN_CHANGE, MANAGER_ADMIN
  /\b[a-z]+_[a-z_]+\b/g, // role_change, final_adjust, template_item
  /\b(?:adminAudit|activity|perm|timeline)\.[a-zA-Z.]+/g, // missing message key
  /\b[a-z]+\.[a-z]+\.[a-z_]+\b/g, // permission codes (eol.document.approve)
  /\b(true|false|null|undefined|BRANCH|DEPOT)\b/g,
  /Unknown value|Bilinmeyen değer/g,
];
const TYPES = {
  USER_ADMIN_CHANGE: { tr: 'Kullanıcı yönetimi', en: 'User management' },
  ROLE_PERMISSION_CHANGE: { tr: 'Rol ve izinler', en: 'Roles & permissions' },
  CHECKLIST_TEMPLATE_CHANGE: { tr: 'Şablon düzenleme', en: 'Template edits' },
  DEFECT_CATALOG_CHANGE: { tr: 'Hata kataloğu', en: 'Defect catalogue' },
};

async function login(email, password) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`login ${email} ${res.status} ${await res.text()}`);
  return res.json();
}

const manager = await login('manager@karea.local', 'changeme123');
const viewer = await login('tmp.audit.viewer@karea.local', 'Kq7#mZr4!pLw9');
const browser = await chromium.launch({ headless: true });
const facts = {};
let failed = false;
const fail = (msg) => {
  failed = true;
  console.error('FAIL ' + msg);
};

async function open(session, locale) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  await context.addInitScript(
    ({ data, locale }) => {
      localStorage.setItem('karea.auth.session', JSON.stringify(data));
      localStorage.setItem('karea-theme-mode', 'light');
      localStorage.setItem('karea-locale', locale);
    },
    { data: { token: session.token, user: session.user, permissions: session.permissions }, locale },
  );
  const page = await context.newPage();
  await page.goto(`${BASE}/activity`, { waitUntil: 'networkidle' });
  await page.locator('table tbody tr').first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(300);
  return page;
}

const typeSelect = (page) => page.locator('select').first();
const rows = (page) =>
  page.locator('table tbody tr').evaluateAll((trs) =>
    trs.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.innerText.trim())),
  );
const options = (page) =>
  typeSelect(page).locator('option').evaluateAll((os) => os.map((o) => ({ value: o.value, label: o.textContent })));

async function shoot(page, file) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight + 50);
  await page.setViewportSize({ width: 1280, height: Math.min(height, 6000) });
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, file), fullPage: true });
}

function scan(key, table) {
  const text = table.map((r) => r.join(' | ')).join('\n').replace(/\S+@karea\.local/g, '');
  const raw = [...new Set(RAW.flatMap((re) => text.match(re) ?? []))];
  if (raw.length) fail(`${key}: raw values ${raw.join(', ')}`);
  return raw;
}

async function selectType(page, type) {
  const done = page.waitForResponse((r) => r.url().includes('/audit/activity') && r.url().includes(type || 'limit'));
  await typeSelect(page).selectOption(type);
  await done;
  await page.waitForTimeout(300);
}

for (const locale of ['tr', 'en']) {
  const page = await open(manager, locale);
  const opts = await options(page);
  for (const [type, label] of Object.entries(TYPES)) {
    if (!opts.some((o) => o.value === type && o.label === label[locale])) fail(`${locale}: option ${type} missing`);
  }
  await shoot(page, `web-${locale}-manager-all.png`);
  const all = await rows(page);
  facts[`${locale}-manager-all`] = { options: opts, raw: scan(`${locale} all`, all), rows: all };

  for (const [type, label] of Object.entries(TYPES)) {
    await selectType(page, type);
    const table = await rows(page);
    const actions = [...new Set(table.map((r) => r[1]))];
    if (table.length === 0 || actions.length !== 1 || actions[0] !== label[locale]) {
      fail(`${locale} filter ${type}: actions ${JSON.stringify(actions)}`);
    }
    if (table.some((r) => r[2] !== '—')) fail(`${locale} filter ${type}: vehicle column not empty`);
    const short = type.split('_')[0].toLowerCase();
    if (locale === 'tr' || type === 'USER_ADMIN_CHANGE') await shoot(page, `web-${locale}-filter-${short}.png`);
    facts[`${locale}-filter-${type}`] = { rows: table.length, actions, raw: scan(`${locale} ${type}`, table), lines: table };
    console.log(`${locale} filter ${type}: ${table.length} rows, action column ${JSON.stringify(actions)}`);
  }
  await page.context().close();
}

{
  const page = await open(viewer, 'tr');
  const opts = await options(page);
  const values = opts.map((o) => o.value);
  const hidden = ['USER_ADMIN_CHANGE', 'ROLE_PERMISSION_CHANGE'].filter((t) => !values.includes(t));
  const kept = ['CHECKLIST_TEMPLATE_CHANGE', 'DEFECT_CATALOG_CHANGE'].filter((t) => values.includes(t));
  if (hidden.length !== 2 || kept.length !== 2) fail(`viewer options ${JSON.stringify(values)}`);
  const table = await rows(page);
  const actions = [...new Set(table.map((r) => r[1]))];
  if (actions.includes(TYPES.USER_ADMIN_CHANGE.tr) || actions.includes(TYPES.ROLE_PERMISSION_CHANGE.tr)) {
    fail(`viewer sees user/role rows: ${JSON.stringify(actions)}`);
  }
  await shoot(page, 'web-tr-viewer-all.png');
  facts['tr-viewer'] = { options: opts, actions, raw: scan('viewer', table), rows: table.length };
  console.log(`viewer: options ${JSON.stringify(values)}; action column ${JSON.stringify(actions)}`);
  await page.context().close();
}

fs.writeFileSync(path.join(OUT, 'web-facts.json'), JSON.stringify(facts, null, 1));
await browser.close();
console.log(failed ? 'WEB CHECKS FAILED' : 'WEB CHECKS PASSED (no raw values)');
process.exit(failed ? 1 : 0);
