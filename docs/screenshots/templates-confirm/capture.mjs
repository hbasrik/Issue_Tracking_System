const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT = path.join(
  '/Users/Basri/Desktop/kts_kms_project/docs/screenshots/templates-confirm',
);
const BASE = 'http://localhost:5173';
const API = 'http://localhost:8080/api/v1';

async function apiLogin() {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'manager@karea.local',
      password: 'changeme123',
    }),
  });
  if (!res.ok) throw new Error(`login ${res.status} ${await res.text()}`);
  const body = await res.json();
  return body.token || body.Token || body.access_token;
}

async function login(page) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', 'manager@karea.local');
  await page.fill('input[type="password"]', 'changeme123');
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 15000 });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const token = await apiLogin();
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  // Disposable inactive item (do not touch seed catalogue items)
  const created = await fetch(`${API}/checklist-templates/3/items`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      ItemText: 'SCREENSHOT_TEMP_INACTIVE_ITEM',
      EolPhase: 'BRANCH',
    }),
  });
  if (!created.ok) throw new Error(`create item ${created.status} ${await created.text()}`);
  const item = await created.json();
  const itemId = item.ID || item.id;

  // Deactivate so we have an inactive row with live Aktife al button
  const deact = await fetch(`${API}/checklist-templates/3/items/${itemId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ IsActive: false }),
  });
  if (!deact.ok) throw new Error(`deactivate ${deact.status} ${await deact.text()}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();

  await page.addInitScript(() => {
    localStorage.setItem('karea-theme-mode', 'light');
  });

  await login(page);
  await page.goto(`${BASE}/templates`);
  await page.getByText('Default EoL', { exact: false }).first().click();
  await page.waitForTimeout(1000);

  // Unhide inactive if needed
  const hide = page.getByLabel(/Pasif maddeleri gizle|Hide inactive/i);
  if (await hide.count()) {
    const checked = await hide.isChecked().catch(() => false);
    if (checked) await hide.click();
  }

  await page
    .locator('h2')
    .filter({ hasText: /düzenleyici|editor/i })
    .locator('..')
    .screenshot({ path: path.join(OUT, 'items-active-passive-light.png') });

  await page.getByRole('button', { name: /Pasife çek|Deactivate/i }).first().click();
  await page.getByRole('alertdialog').waitFor({ timeout: 10000 });
  await page.screenshot({
    path: path.join(OUT, 'confirm-modal-light.png'),
  });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // Dark
  await page.goto(`${BASE}/settings`);
  await page.getByRole('button', { name: /Koyu|Dark/i }).click();
  await page.waitForTimeout(400);
  await page.goto(`${BASE}/templates`);
  await page.getByText('Default EoL', { exact: false }).first().click();
  await page.waitForTimeout(1000);
  if (await hide.count()) {
    /* re-query */
  }
  const hide2 = page.getByLabel(/Pasif maddeleri gizle|Hide inactive/i);
  if (await hide2.count()) {
    const checked = await hide2.isChecked().catch(() => false);
    if (checked) await hide2.click();
  }

  await page
    .locator('h2')
    .filter({ hasText: /düzenleyici|editor/i })
    .locator('..')
    .screenshot({ path: path.join(OUT, 'items-active-passive-dark.png') });

  await page.getByRole('button', { name: /Pasife çek|Deactivate/i }).first().click();
  await page.getByRole('alertdialog').waitFor({ timeout: 10000 });
  await page.screenshot({
    path: path.join(OUT, 'confirm-modal-dark.png'),
  });
  await page.keyboard.press('Escape');

  await page.goto(`${BASE}/settings`);
  await page.getByRole('button', { name: /Açık|Light/i }).click();
  await browser.close();

  // Cleanup disposable item (PENDING already cleared on deactivate)
  const del = await fetch(`${API}/checklist-templates/3/items/${itemId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!del.ok && del.status !== 204) {
    console.warn('cleanup delete failed', del.status, await del.text());
  }

  console.log('wrote screenshots to', OUT);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
