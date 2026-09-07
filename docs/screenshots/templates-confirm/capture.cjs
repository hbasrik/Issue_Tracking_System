const { chromium } = require('/Users/Basri/Desktop/kts_kms_project/web/node_modules/playwright');
const path = require('path');
const fs = require('fs');

const OUT = path.join(
  '/Users/Basri/Desktop/kts_kms_project/docs/screenshots/templates-confirm',
);
const BASE = 'http://localhost:5173';
const API = 'http://localhost:8080/api/v1';
const AUTH_KEY = 'karea.auth.session';

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
  return res.json();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const session = await apiLogin();
  const token = session.token;
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

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
  const itemId = item.ID;

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

  await context.addInitScript(
    ({ key, data }) => {
      localStorage.setItem(key, JSON.stringify(data));
      if (!localStorage.getItem('karea-theme-mode')) {
        localStorage.setItem('karea-theme-mode', 'light');
      }
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
  await page.goto(`${BASE}/templates`);
  await page.waitForTimeout(1500);
  console.log('url', page.url());

  // Click first template card / row
  const tmpl = page.locator('table tbody tr').first();
  await tmpl.click();
  await page.waitForTimeout(1200);

  const hide = page.locator('label').filter({ hasText: /Pasif|inactive/i }).locator('input');
  if (await hide.count()) {
    if (await hide.isChecked()) await hide.click();
  }

  await page.getByText('SCREENSHOT_TEMP_INACTIVE_ITEM').scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);

  await page
    .locator('li')
    .filter({ hasText: 'SCREENSHOT_TEMP_INACTIVE_ITEM' })
    .screenshot({ path: path.join(OUT, 'items-active-passive-light.png') });

  // Also capture an active item above for pair comparison
  await page
    .locator('li')
    .filter({ hasText: 'Verify exterior paint' })
    .first()
    .screenshot({ path: path.join(OUT, 'item-active-light.png') });

  await page.getByRole('button', { name: /Pasife çek|Deactivate/i }).first().click();
  await page.getByRole('alertdialog').waitFor({ timeout: 10000 });
  await page.screenshot({ path: path.join(OUT, 'confirm-modal-light.png') });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // Dark theme via localStorage + reload (init script will not overwrite)
  await page.evaluate(() => localStorage.setItem('karea-theme-mode', 'dark'));
  await page.reload();
  await page.waitForTimeout(1200);
  await page.locator('table tbody tr').first().click();
  await page.waitForTimeout(1200);
  const hide2 = page.locator('label').filter({ hasText: /Pasif|inactive/i }).locator('input');
  if (await hide2.count()) {
    if (await hide2.isChecked()) await hide2.click();
  }

  await page.getByText('SCREENSHOT_TEMP_INACTIVE_ITEM').scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page
    .locator('li')
    .filter({ hasText: 'SCREENSHOT_TEMP_INACTIVE_ITEM' })
    .screenshot({ path: path.join(OUT, 'items-active-passive-dark.png') });
  await page
    .locator('li')
    .filter({ hasText: 'Verify exterior paint' })
    .first()
    .screenshot({ path: path.join(OUT, 'item-active-dark.png') });

  await page.getByRole('button', { name: /Pasife çek|Deactivate/i }).first().click();
  await page.getByRole('alertdialog').waitFor({ timeout: 10000 });
  await page.screenshot({ path: path.join(OUT, 'confirm-modal-dark.png') });
  await page.keyboard.press('Escape');

  await page.evaluate(() => localStorage.setItem('karea-theme-mode', 'light'));
  await browser.close();

  const del = await fetch(`${API}/checklist-templates/3/items/${itemId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log('cleanup delete', del.status);
  console.log('wrote', OUT);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
