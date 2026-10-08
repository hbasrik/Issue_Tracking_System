/**
 * Screenshot: template item active/passive + deactivate confirm dialog.
 *
 * Creates its own disposable EOL template (inactive so it does not collide
 * with the unique active-generic-EOL constraint) and two items on it.
 * Never touches seed templates (e.g. id 3 Default EoL).
 *
 * Runs against a test stack only: API on :18081 and Vite on :5175 (pointed at
 * that API), database karea_eolnote_test. Never the API on :8080 or the
 * live database.
 */
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from '../../../web/node_modules/playwright/index.mjs';
import { scriptOutputDir } from '../lib/output-dir.mjs';

const OUT = scriptOutputDir(import.meta.url);
const BASE = 'http://localhost:5175';
const API = 'http://localhost:18081/api/v1';
const DB = 'postgres://karea:karea_secret@localhost:5432/karea_eolnote_test?sslmode=disable';
const PSQL = '/opt/homebrew/opt/libpq/bin/psql';
const MARKER = `SCREENSHOT_TEMP_EOL_${Date.now()}`;

if (API.includes(':8080') || !DB.split('?')[0].endsWith('_test')) {
  throw new Error('templates-confirm runs only against the test API and a *_test database');
}

function sql(query) {
  const out = execFileSync(
    PSQL,
    [DB, '-X', '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-c', query],
    { encoding: 'utf8' },
  ).trim();
  // compose/psql may append "INSERT 0 1" after RETURNING; keep data lines only.
  const dataLine = out
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l && !/^(INSERT|UPDATE|DELETE)\b/i.test(l));
  return dataLine ?? out;
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
  if (!res.ok) throw new Error(`login ${res.status} ${await res.text()}`);
  return res.json();
}

async function apiJson(method, urlPath, token, body) {
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

(async () => {
  const session = await apiLogin();
  const token = session.token;

  // Own template: inactive + unassigned so seed EOL stays sole active generic.
  const templateId = Number(
    sql(
      `INSERT INTO checklist_templates (type, name, is_active)
       VALUES ('EOL', '${MARKER}', FALSE)
       RETURNING id`,
    ),
  );
  if (!templateId) throw new Error('failed to create temp template');

  let activeItemId;
  let inactiveItemId;
  try {
    const active = await apiJson('POST', `/checklist-templates/${templateId}/items`, token, {
      ItemText: `${MARKER}_ACTIVE`,
      EolPhase: 'BRANCH',
      PropagationScope: 'not_started',
    });
    activeItemId = active.ID || active.id;

    const inactive = await apiJson('POST', `/checklist-templates/${templateId}/items`, token, {
      ItemText: `${MARKER}_INACTIVE`,
      EolPhase: 'BRANCH',
      PropagationScope: 'not_started',
    });
    inactiveItemId = inactive.ID || inactive.id;

    await apiJson(
      'PATCH',
      `/checklist-templates/${templateId}/items/${inactiveItemId}`,
      token,
      { IsActive: false, PropagationScope: 'not_started' },
    );

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();

    // Without "remember me" the web keeps the session in memory only, so a
    // full navigation would land on /login; seed the persisted session.
    await page.addInitScript((data) => {
      localStorage.setItem('karea.auth.session', JSON.stringify(data));
      if (!localStorage.getItem('karea-theme-mode')) {
        localStorage.setItem('karea-theme-mode', 'light');
      }
    }, { token: session.token, user: session.user, permissions: session.permissions });

    async function openOwnTemplate(page) {
      const listed = await apiJson('GET', '/checklist-templates', token);
      const rows = listed.items || listed.Items || [];
      const idx = rows.findIndex((t) => (t.Name || t.name) === MARKER);
      if (idx < 0) throw new Error(`temp template ${MARKER} missing from list`);
      await page.goto(`${BASE}/templates`);
      const desktop = page.locator('table tbody tr.cursor-pointer');
      await page.waitForFunction(
        (n) => document.querySelectorAll('table tbody tr.cursor-pointer').length === n,
        rows.length,
        { timeout: 15000 },
      );
      await desktop.nth(idx).click();
      await page.getByText(MARKER, { exact: false }).first().waitFor({ timeout: 10000 });
      await page.waitForTimeout(500);
    }

    await openOwnTemplate(page);

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

    await page
      .locator('li')
      .filter({ hasText: `${MARKER}_ACTIVE` })
      .getByRole('button', { name: /Pasife çek|Deactivate/i })
      .click();
    await page.getByRole('alertdialog').waitFor({ timeout: 10000 });
    await page.screenshot({
      path: path.join(OUT, 'confirm-modal-light.png'),
    });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    await page.goto(`${BASE}/settings`);
    await page.getByRole('button', { name: /Koyu|Dark/i }).click();
    await page.waitForTimeout(400);
    await openOwnTemplate(page);
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

    await page
      .locator('li')
      .filter({ hasText: `${MARKER}_ACTIVE` })
      .getByRole('button', { name: /Pasife çek|Deactivate/i })
      .click();
    await page.getByRole('alertdialog').waitFor({ timeout: 10000 });
    await page.screenshot({
      path: path.join(OUT, 'confirm-modal-dark.png'),
    });
    await page.keyboard.press('Escape');

    await page.goto(`${BASE}/settings`);
    await page.getByRole('button', { name: /Açık|Light/i }).click();
    await browser.close();
  } finally {
    // Delete only our template (items cascade). Never touch seed templates.
    sql(`DELETE FROM checklist_templates WHERE id = ${templateId} AND name = '${MARKER}'`);
    const leftover = sql(
      `SELECT count(*) FROM checklist_templates WHERE name = '${MARKER}'`,
    );
    if (leftover !== '0') {
      console.warn('cleanup leftover template count', leftover);
    }
  }

  console.log('wrote screenshots to', OUT, {
    templateId,
    activeItemId,
    inactiveItemId,
  });
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
