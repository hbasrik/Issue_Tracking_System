/**
 * Alternate capture (CJS) for template confirm screenshots.
 * Own disposable EOL template only — never mutates seed template id 3.
 *
 * Runs against a test stack only: API on :18081 and Vite on :5175 (pointed at
 * that API), database karea_eolnote_test. Never the API on :8080 or the
 * live database.
 */
const path = require('path');
const { chromium } = require(path.join(__dirname, '../../../web/node_modules/playwright'));
const { execFileSync } = require('child_process');

let OUT;
const BASE = 'http://localhost:5175';
const API = 'http://localhost:18081/api/v1';
const DB = 'postgres://karea:karea_secret@localhost:5432/karea_eolnote_test?sslmode=disable';
const PSQL = '/opt/homebrew/opt/libpq/bin/psql';
const AUTH_KEY = 'karea.auth.session';
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
  const { outputDir } = await import('../lib/output-dir.mjs');
  OUT = outputDir(__dirname);
  const session = await apiLogin();
  const token = session.token;

  const templateId = Number(
    sql(
      `INSERT INTO checklist_templates (type, name, is_active)
       VALUES ('EOL', '${MARKER}', FALSE)
       RETURNING id`,
    ),
  );
  if (!templateId) throw new Error('failed to create temp template');

  try {
    const active = await apiJson('POST', `/checklist-templates/${templateId}/items`, token, {
      ItemText: `${MARKER}_ACTIVE`,
      EolPhase: 'BRANCH',
      PropagationScope: 'not_started',
    });
    const activeItemId = active.ID || active.id;

    const inactive = await apiJson('POST', `/checklist-templates/${templateId}/items`, token, {
      ItemText: `${MARKER}_INACTIVE`,
      EolPhase: 'BRANCH',
      PropagationScope: 'not_started',
    });
    const inactiveItemId = inactive.ID || inactive.id;

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

    async function openOwnTemplate(page) {
      const listed = await apiJson('GET', '/checklist-templates', token);
      const rows = listed.items || listed.Items || [];
      const idx = rows.findIndex((t) => (t.Name || t.name) === MARKER);
      if (idx < 0) throw new Error(`temp template ${MARKER} missing from list`);
      await page.goto(`${BASE}/templates`);
      await page.waitForFunction(
        (n) => document.querySelectorAll('table tbody tr.cursor-pointer').length === n,
        rows.length,
        { timeout: 15000 },
      );
      await page.locator('table tbody tr.cursor-pointer').nth(idx).click();
      await page.getByText(MARKER, { exact: false }).first().waitFor({ timeout: 10000 });
      await page.waitForTimeout(500);
    }

    const page = await context.newPage();
    await openOwnTemplate(page);

    const hide = page.locator('label').filter({ hasText: /Pasif|inactive/i }).locator('input');
    if (await hide.count()) {
      if (await hide.isChecked()) await hide.click();
    }

    await page.getByText(`${MARKER}_INACTIVE`).scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);

    await page
      .locator('li')
      .filter({ hasText: `${MARKER}_INACTIVE` })
      .screenshot({ path: path.join(OUT, 'items-active-passive-light.png') });

    await page
      .locator('li')
      .filter({ hasText: `${MARKER}_ACTIVE` })
      .screenshot({ path: path.join(OUT, 'item-active-light.png') });

    await page
      .locator('li')
      .filter({ hasText: `${MARKER}_ACTIVE` })
      .getByRole('button', { name: /Pasife çek|Deactivate/i })
      .click();
    await page.getByRole('alertdialog').waitFor({ timeout: 10000 });
    await page.screenshot({ path: path.join(OUT, 'confirm-modal-light.png') });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    await page.evaluate(() => localStorage.setItem('karea-theme-mode', 'dark'));
    await openOwnTemplate(page);
    const hide2 = page.locator('label').filter({ hasText: /Pasif|inactive/i }).locator('input');
    if (await hide2.count()) {
      if (await hide2.isChecked()) await hide2.click();
    }

    await page.getByText(`${MARKER}_INACTIVE`).scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await page
      .locator('li')
      .filter({ hasText: `${MARKER}_INACTIVE` })
      .screenshot({ path: path.join(OUT, 'items-active-passive-dark.png') });
    await page
      .locator('li')
      .filter({ hasText: `${MARKER}_ACTIVE` })
      .screenshot({ path: path.join(OUT, 'item-active-dark.png') });

    await page
      .locator('li')
      .filter({ hasText: `${MARKER}_ACTIVE` })
      .getByRole('button', { name: /Pasife çek|Deactivate/i })
      .click();
    await page.getByRole('alertdialog').waitFor({ timeout: 10000 });
    await page.screenshot({ path: path.join(OUT, 'confirm-modal-dark.png') });
    await page.keyboard.press('Escape');

    await page.evaluate(() => localStorage.setItem('karea-theme-mode', 'light'));
    await browser.close();

    void activeItemId;
  } finally {
    sql(`DELETE FROM checklist_templates WHERE id = ${templateId} AND name = '${MARKER}'`);
  }

  console.log('wrote', OUT);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
