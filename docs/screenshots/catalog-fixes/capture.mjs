/**
 * Catalogue fixes — web UI proof against the throwaway karea_catalog_test DB.
 * API under test on :18081, web build (VITE_API_BASE_URL=:18081) previewed
 * on :5174. Never points at :8080 / :5173.
 *
 * State set up here (test DB only): zone Body and part 20-01 inactive.
 * Issues 18 (part 10-01 under Body) and 19 (part 20-01) come from
 * run-verification.py.
 */
import { chromium } from '../../../web/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scriptOutputDir } from '../lib/output-dir.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = scriptOutputDir(import.meta.url);
const BASE = 'http://localhost:5174';
const API = 'http://127.0.0.1:18081/api/v1';
const AUTH_KEY = 'karea.auth.session';
if (API.includes(':8080') || BASE.includes(':5173')) throw new Error('never touch the live stack');

async function api(method, p, token, body) {
  const res = await fetch(`${API}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const login = await api('POST', '/auth/login', null, { email: 'manager@karea.local', password: 'changeme123' });
if (login.status !== 200) throw new Error(`login ${login.status}`);
const session = login.body;
const token = session.token;

const zones = (await api('GET', '/defect-zones', token)).body.items;
const parts = (await api('GET', '/defect-parts', token)).body.items;
const body = zones.find((z) => z.Code === '10');
const p2001 = parts.find((p) => p.Code === '20-01');
const r1 = await api('PATCH', `/defect-zones/${body.ID}`, token, {
  code: body.Code, name_tr: body.NameTR, name_en: body.NameEN, sort_order: body.SortOrder, is_active: false,
});
const r2 = await api('PATCH', `/defect-parts/${p2001.ID}`, token, {
  zone_id: p2001.ZoneID, code: p2001.Code, name_tr: p2001.NameTR, name_en: p2001.NameEN,
  sort_order: p2001.SortOrder, is_active: false,
});
console.log('setup: zone Body inactive', r1.status, '| part 20-01 inactive', r2.status);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.addInitScript(
  ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
  { key: AUTH_KEY, value: { token, user: session.user, permissions: session.permissions } },
);

async function editor(issueId, file) {
  await page.goto(`${BASE}/issues/${issueId}`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Sınıflandırmayı düzenle' }).click();
  const box = page.locator('div.space-y-3.rounded-lg.border').filter({ hasText: 'Sınıflandırmayı düzenle' });
  await box.locator('select').first().waitFor();
  await page.waitForTimeout(400);
  const selected = await box.locator('select').evaluateAll((els) =>
    els.map((el) => el.options[el.selectedIndex]?.text ?? ''),
  );
  const hint = await box.getByText('Kayıtlı değer pasif').count();
  await box.screenshot({ path: path.join(OUT, file) });
  console.log(`issue ${issueId} editor selected:`, JSON.stringify(selected), '| hint shown:', hint > 0, '->', file);
  return box;
}

{
  const box = await editor(18, 'web-editor-zone-inactive.png');
  // Save without changes: the kept inactive zone/part must be accepted.
  await box.getByRole('button', { name: 'Kaydet' }).click();
  await page.waitForTimeout(800);
  const stillOpen = await page.locator('div.space-y-3.rounded-lg.border').filter({ hasText: 'Sınıflandırmayı düzenle' }).count();
  console.log('issue 18 save with kept inactive values -> editor closed:', stillOpen === 0);
  await page.screenshot({ path: path.join(OUT, 'web-issue18-after-save.png') });
}
await editor(19, 'web-editor-part-inactive.png');

{
  await page.goto(`${BASE}/issues`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Gelişmiş filtreler/ }).click();
  await page.getByRole('button', { name: /Parça seç/ }).click();
  await page.getByRole('combobox').fill('pasif');
  await page.waitForTimeout(300);
  const opts = await page.getByRole('option').allTextContents();
  console.log('issues part filter options matching "pasif":', JSON.stringify(opts));
  await page.screenshot({ path: path.join(OUT, 'web-issues-filter-inactive-part.png') });
  await page.keyboard.press('Escape');
  const zoneChips = await page.getByRole('button', { name: /\(pasif\)/ }).allTextContents();
  console.log('issues zone/type chips with (pasif):', JSON.stringify(zoneChips));
}

{
  await page.goto(`${BASE}/defect-catalog`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Parçalar' }).click();
  const hide = page.getByLabel('Pasifleri gizle');
  if (await hide.count()) await hide.uncheck();
  await page.waitForTimeout(300);
  const otherRow = page.locator('tr').filter({ hasText: '99-99' });
  const deactivateDisabled = await otherRow.getByRole('button', { name: 'Pasife çek' }).isDisabled().catch(() => null);
  const deleteDisabled = await otherRow.getByRole('button', { name: 'Sil' }).isDisabled().catch(() => null);
  const zoneBadges = await page.locator('td').filter({ hasText: 'Bölge pasif' }).count();
  console.log('admin parts: 99-99 deactivate disabled', deactivateDisabled, '| delete disabled', deleteDisabled,
    '| rows marked "Bölge pasif"', zoneBadges);
  await page.screenshot({ path: path.join(OUT, 'web-admin-parts.png'), fullPage: true });
}

await browser.close();
console.log('ok', OUT);
