/**
 * End-to-end verify approval confirm + undo toast, SQL/audit, then cleanup.
 */
import { chromium } from '../../../web/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = __dirname;
const BASE = 'http://localhost:5173';
const API = 'http://localhost:8080/api/v1';
const AUTH_KEY = 'karea.auth.session';
const PSQL = '/opt/homebrew/opt/libpq/bin/psql';
const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgres://karea:karea_secret@localhost:5432/karea?sslmode=disable';

fs.mkdirSync(OUT, { recursive: true });

function sql(query) {
  return execFileSync(
    PSQL,
    [DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-At', '-F', '|', '-c', query],
    { encoding: 'utf8' },
  ).trim();
}

async function apiLogin() {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'manager@karea.local',
      password: 'changeme123',
    }),
  });
  if (!res.ok) throw new Error(`login ${res.status}`);
  return res.json();
}

async function api(token, method, urlPath, body) {
  const res = await fetch(`${API}${urlPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) throw new Error(`${method} ${urlPath} → ${res.status}: ${text}`);
  return data;
}

const session = await apiLogin();
const token = session.token;

const vehicles = await api(token, 'GET', '/vehicles?limit=1');
const vin = vehicles.items?.[0]?.VIN || vehicles.Items?.[0]?.VIN;
if (!vin) throw new Error('no VIN available for temp issue');

const types = await api(token, 'GET', '/issue-types');
const issueTypeId = types.items?.[0]?.ID;
const stations = await api(token, 'GET', '/stations');
const stationId = stations.items?.[0]?.ID;
if (!issueTypeId || !stationId) throw new Error('missing issue type or station');

const created = await api(token, 'POST', '/issues', {
  vin,
  source_type: 'MANUAL',
  station_id: stationId,
  issue_type_id: issueTypeId,
  severity: 'LOW',
  description: `TEMP_APPROVAL_UNDO_${Date.now()}`,
});
const issueId = created.ID ?? created.id;
console.log('created issue', issueId, 'vin', vin);

await api(token, 'PATCH', `/issues/${issueId}/status`, { status: 'IN_PROGRESS' });
await api(token, 'PATCH', `/issues/${issueId}/status`, {
  status: 'DONE',
  solution_description: 'temp solution for undo qa',
});

function dumpIssue(label) {
  const row = sql(
    `SELECT id||'|'||status||'|'||coalesce(approve_reporter_id::text,'')||'|'||coalesce(approve_date::text,'')||'|'||coalesce(conditional_approve_reporter_id::text,'')||'|'||coalesce(conditional_approve_date::text,'') FROM issue_list WHERE id = ${issueId}`,
  );
  console.log(label, row);
  return row;
}

function dumpAudit(label) {
  const rows = sql(
    `SELECT id||'|'||old_value||'|'||new_value||'|'||coalesce(performed_by::text,'')||'|'||coalesce(metadata->>'action','') FROM audit_logs WHERE event_type = 'ISSUE_STATUS_CHANGE' AND metadata->>'issue_id' = '${issueId}' ORDER BY id`,
  );
  console.log(label, rows);
  return rows;
}

async function openDoneIssue(page) {
  await page.goto(`${BASE}/issues`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.getByRole('button', { name: /^Tamamlandı$|^Done$/i }).click();
  await page.waitForTimeout(400);
  const mobileCard = page.locator('div.lg\\:hidden').getByText(`#${issueId}`, { exact: true });
  const desktopRow = page.locator('div.hidden.lg\\:block tr', { hasText: `#${issueId}` });
  if (await mobileCard.first().isVisible().catch(() => false)) {
    await mobileCard.first().click();
  } else {
    await desktopRow.first().click();
  }
  await page.waitForTimeout(500);
}

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addInitScript(
  ({ key, data }) => {
    localStorage.setItem(key, JSON.stringify(data));
    localStorage.setItem('karea-theme-mode', 'light');
    localStorage.setItem('karea-locale', 'tr');
  },
  {
    key: AUTH_KEY,
    data: {
      token: session.token,
      user: session.user,
      permissions: session.permissions,
    },
  },
);
const page = await context.newPage();
await openDoneIssue(page);

await page.getByRole('button', { name: /^Kalite Onay$|^Quality approved$/i }).last().click();
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(OUT, 'web-confirm-dialog.png') });
await page.getByRole('button', { name: /^Onayla$|^Confirm$/i }).click();
await page.waitForTimeout(800);
await page.screenshot({ path: path.join(OUT, 'web-undo-toast.png') });

const afterApprove = dumpIssue('after approve');
if (!afterApprove.includes('|APPROVED|')) throw new Error(`expected APPROVED: ${afterApprove}`);

// UI undo within the window
await page.getByRole('button', { name: /Geri al|Undo/i }).click();
await page.waitForTimeout(800);
await page.screenshot({ path: path.join(OUT, 'web-after-ui-undo.png') });
const afterUndo = dumpIssue('after ui undo');
if (!afterUndo.includes('|DONE|')) throw new Error(`expected DONE: ${afterUndo}`);
{
  const parts = afterUndo.split('|');
  if (parts[2] || parts[3] || parts[4] || parts[5]) {
    throw new Error(`approve fields not cleared: ${afterUndo}`);
  }
}
const audits = dumpAudit('audits');
if (!audits.includes('APPROVED|DONE|') || !audits.includes('approval_undone')) {
  throw new Error('approval_undone audit missing');
}

// 15s expiry: approve again, do not click undo, wait out the toast
await openDoneIssue(page);
await page.getByRole('button', { name: /^Kalite Onay$|^Quality approved$/i }).last().click();
await page.waitForTimeout(250);
await page.getByRole('button', { name: /^Onayla$|^Confirm$/i }).click();
await page.waitForTimeout(400);
console.log('waiting 15s for toast expiry…');
await page.waitForTimeout(15_500);
const toastVisible = await page.getByRole('button', { name: /Geri al|Undo/i }).count();
console.log('undo buttons after 15s', toastVisible);
if (toastVisible !== 0) throw new Error('undo toast still visible after 15s');

let patchBlocked = false;
try {
  await api(token, 'PATCH', `/issues/${issueId}/status`, { status: 'DONE' });
} catch (e) {
  patchBlocked = true;
  console.log('patch reversal blocked:', String(e.message).slice(0, 160));
}
if (!patchBlocked) throw new Error('PATCH status must not reverse approval');

await browser.close();

// Mobile-width confirm (RN ConfirmDialog mirrors this UX)
const browser2 = await chromium.launch({ headless: true, channel: 'chrome' });
const mobileCtx = await browser2.newContext({ viewport: { width: 390, height: 844 } });
await mobileCtx.addInitScript(
  ({ key, data }) => {
    localStorage.setItem(key, JSON.stringify(data));
    localStorage.setItem('karea-theme-mode', 'light');
    localStorage.setItem('karea-locale', 'tr');
  },
  {
    key: AUTH_KEY,
    data: {
      token: session.token,
      user: session.user,
      permissions: session.permissions,
    },
  },
);
await api(token, 'POST', `/issues/${issueId}/undo-approval`, {});
const mpage = await mobileCtx.newPage();
await openDoneIssue(mpage);
await mpage.getByRole('button', { name: /^Kalite Onay$|^Quality approved$/i }).last().click();
await mpage.waitForTimeout(400);
await mpage.screenshot({ path: path.join(OUT, 'mobile-width-confirm-dialog.png') });
await mpage.getByRole('button', { name: /İptal|Cancel/i }).last().click();
await browser2.close();

sql(
  `DELETE FROM media_attachments WHERE entity_type IN ('ISSUE','ISSUE_RESOLUTION') AND entity_id = '${issueId}'`,
);
sql(
  `DELETE FROM audit_logs WHERE event_type = 'ISSUE_STATUS_CHANGE' AND metadata->>'issue_id' = '${issueId}'`,
);
sql(`DELETE FROM issue_list WHERE id = ${issueId}`);
const gone = sql(`SELECT id FROM issue_list WHERE id = ${issueId}`);
console.log('cleaned', gone === '');
console.log('PASS');
