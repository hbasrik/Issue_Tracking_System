/**
 * Web error-state verification: connection loss, timeout, 5xx and 4xx on the
 * six data pages. Failures are simulated with Playwright request routing, so
 * the API only serves the login + reads; nothing is written.
 *
 *   cd web && KAREA_EMAIL=... KAREA_PASSWORD=... node ../scripts/verify-web-errors.mjs
 *
 * Use a temp user (a real seed login would silently rehash its password).
 */
import fs from 'node:fs';
import path from 'node:path';
import pw from '../web/node_modules/playwright/index.js';
import { outputDir } from '../docs/screenshots/lib/output-dir.mjs';
const { chromium } = pw;

const API = process.env.VITE_API_BASE_URL || 'http://localhost:8080/api/v1';
const WEB = process.env.WEB_BASE || 'http://localhost:5173';
const EMAIL = process.env.KAREA_EMAIL;
const PASS = process.env.KAREA_PASSWORD;
const OUT = outputDir('../docs/screenshots/web-errors');
const SKIP_TIMEOUT = process.env.SKIP_TIMEOUT === '1';

const RAW_MARKERS = [
  'Failed to fetch',
  'NetworkError',
  'Load failed',
  'internal server error',
  'limit must be between',
  'HTTP 500',
  'HTTP 400',
  'media fetch',
];

let failures = 0;
function check(cond, msg) {
  if (cond) console.log(`ok   ${msg}`);
  else {
    failures++;
    console.error(`FAIL ${msg}`);
  }
}

async function login() {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASS }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`login ${res.status} ${JSON.stringify(body)}`);
  return body;
}

async function firstVin(token) {
  const res = await fetch(`${API}/vehicles?page=1`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json();
  return body.Items?.[0]?.VIN;
}

const isApi = (url) => url.startsWith(API);

async function newPage(browser, session, locale = 'tr') {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript(
    ([s, loc]) => {
      localStorage.setItem('karea.auth.session', JSON.stringify(s));
      localStorage.setItem('karea-locale', loc);
    },
    [{ token: session.token, user: session.user, permissions: session.permissions }, locale],
  );
  return { context, page: await context.newPage() };
}

async function bodyText(page) {
  return page.locator('body').innerText();
}

async function noRawText(page, label) {
  const text = await bodyText(page);
  const leaked = RAW_MARKERS.filter((m) => text.includes(m));
  check(leaked.length === 0, `${label}: no raw technical text${leaked.length ? ` (found ${leaked})` : ''}`);
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false });
}

/** Abort every API call after the page shell is up: simulates a lost connection. */
async function offlineCase(browser, session, route, name, expectTitle, locale = 'tr') {
  const { context, page } = await newPage(browser, session, locale);
  await page.route('**/*', (r) => (isApi(r.request().url()) ? r.abort('internetdisconnected') : r.continue()));
  await page.goto(`${WEB}${route}`);
  const state = page.getByTestId('load-error-state').first();
  await state.waitFor({ timeout: 20000 });
  const text = await state.innerText();
  check(text.includes(expectTitle), `${name}: title "${expectTitle}"`);
  const offlineCopy =
    locale === 'tr' ? 'Sunucuya bağlanılamadı' : 'Could not reach the server';
  check(text.includes(offlineCopy), `${name}: connection message`);
  check(!/Hata kodu|Error code/.test(text), `${name}: no request code for a connection error`);
  check((await state.getByRole('button', { name: locale === 'tr' ? 'Tekrar dene' : 'Retry' }).count()) === 1, `${name}: retry button`);
  await noRawText(page, name);
  check(!/\(0\)/.test(await bodyText(page)), `${name}: no fake "(0)" counters`);
  await shot(page, name);
  await context.close();
  return page;
}

async function statusCase(browser, session, route, match, status, body, name) {
  const { context, page } = await newPage(browser, session);
  await page.route('**/*', (r) => {
    const url = r.request().url();
    if (isApi(url) && match(url)) {
      return r.fulfill({
        status,
        contentType: 'application/json',
        headers: { 'X-Request-ID': body.request_id },
        body: JSON.stringify(body),
      });
    }
    return r.continue();
  });
  await page.goto(`${WEB}${route}`);
  const state = page.getByTestId('load-error-state').first();
  await state.waitFor({ timeout: 20000 });
  const text = await state.innerText();
  await noRawText(page, name);
  await shot(page, name);
  await context.close();
  return text;
}

async function main() {
  if (!EMAIL || !PASS) throw new Error('KAREA_EMAIL / KAREA_PASSWORD required');
  fs.mkdirSync(OUT, { recursive: true });
  const session = await login();
  const vin = await firstVin(session.token);
  if (!vin) throw new Error('no vehicle to open');
  const browser = await chromium.launch();

  // 1) Connection lost on every page
  await offlineCase(browser, session, '/', '01-home-offline', 'Panel yüklenemedi');
  await offlineCase(browser, session, '/issues', '02-issues-offline', 'Issue listesi yüklenemedi');
  await offlineCase(browser, session, '/analysis', '03-analysis-offline', 'Analiz yüklenemedi');
  await offlineCase(browser, session, '/vehicles', '04-vehicles-offline', 'Araçlar yüklenemedi');
  await offlineCase(browser, session, `/vehicles/${vin}`, '05-vehicle-detail-offline', 'Araç yüklenemedi');
  await offlineCase(browser, session, '/activity', '06-activity-offline', 'Hareketler yüklenemedi');
  await offlineCase(browser, session, '/vehicles', '07-vehicles-offline-en', 'Could not load vehicles', 'en');

  // Home must not paint zero stat cards when nothing loaded
  {
    const { context, page } = await newPage(browser, session);
    await page.route('**/*', (r) => (isApi(r.request().url()) ? r.abort('internetdisconnected') : r.continue()));
    await page.goto(`${WEB}/`);
    await page.getByTestId('load-error-state').waitFor();
    const stat = await page.getByText('Açık Hatalar', { exact: false }).count();
    check(stat === 0, 'home offline: stat cards hidden (no fake zeros)');
    await context.close();
  }

  // 2) 5xx shows the request id as "Hata kodu"
  const t5 = await statusCase(
    browser,
    session,
    '/vehicles',
    (u) => /\/vehicles(\?|$)/.test(u),
    500,
    { error: 'internal server error', request_id: 'verify-5xx-req-01' },
    '08-vehicles-500',
  );
  check(t5.includes('Sunucuda beklenmeyen bir hata oluştu'), '5xx: server message');
  check(t5.includes('Hata kodu: verify-5xx-req-01'), '5xx: "Hata kodu: verify-5xx-req-01" shown');

  const t5b = await statusCase(
    browser,
    session,
    '/activity',
    (u) => u.includes('/audit/activity'),
    503,
    { error: 'service unavailable', request_id: 'verify-5xx-req-02' },
    '09-activity-503',
  );
  check(t5b.includes('Hata kodu: verify-5xx-req-02'), '503: request code shown');

  // 3) 4xx: translated generic copy, no request id, no raw English
  const t4 = await statusCase(
    browser,
    session,
    '/vehicles',
    (u) => /\/vehicles(\?|$)/.test(u),
    400,
    { error: 'limit must be between 1 and 200', request_id: 'verify-4xx-req-01' },
    '10-vehicles-400',
  );
  check(t4.includes('İstek işlenemedi'), '4xx: translated generic message');
  check(!t4.includes('verify-4xx-req-01') && !t4.includes('Hata kodu'), '4xx: request id hidden');

  const t404 = await statusCase(
    browser,
    session,
    `/vehicles/${vin}`,
    (u) => u.endsWith(`/vehicles/${vin}`),
    404,
    { error: 'entity not found', request_id: 'verify-4xx-req-02' },
    '11-vehicle-detail-404',
  );
  check(t404.includes('Kayıt bulunamadı'), '404: translated sentinel');
  check(!t404.includes('verify-4xx-req-02'), '404: request id hidden');

  const tIssues = await statusCase(
    browser,
    session,
    '/issues',
    (u) => /\/issues(\?|$)/.test(u),
    500,
    { error: 'internal server error', request_id: 'verify-5xx-req-03' },
    '12-issues-500',
  );
  check(tIssues.includes('Hata kodu: verify-5xx-req-03'), 'issues 5xx: request code shown');

  // 4) Refresh fails while data is on screen: stale warning, data kept
  {
    const { context, page } = await newPage(browser, session);
    let fail = false;
    await page.route('**/*', (r) =>
      fail && isApi(r.request().url()) ? r.abort('internetdisconnected') : r.continue(),
    );
    await page.goto(`${WEB}/`);
    await page.getByText('Açık Hatalar', { exact: false }).first().waitFor({ timeout: 20000 });
    fail = true;
    await page.getByRole('button', { name: 'Yenile' }).first().click();
    const state = page.getByTestId('load-error-state').first();
    await state.waitFor();
    const text = await state.innerText();
    check(text.includes('Veriler yenilenemedi'), 'home refresh failure: stale warning');
    check((await page.getByText('Açık Hatalar', { exact: false }).count()) > 0, 'home refresh failure: last data kept');
    await noRawText(page, 'home stale');
    await shot(page, '13-home-refresh-stale');
    await context.close();
  }

  // 5) Timeout: the API never answers within 15 s
  if (!SKIP_TIMEOUT) {
    const { context, page } = await newPage(browser, session);
    await page.route('**/*', (r) =>
      isApi(r.request().url()) && /\/vehicles(\?|$)/.test(r.request().url())
        ? undefined /* never respond */
        : r.continue(),
    );
    await page.goto(`${WEB}/vehicles`);
    const state = page.getByTestId('load-error-state').first();
    await state.waitFor({ timeout: 25000 });
    const text = await state.innerText();
    check(text.includes('Sunucu zamanında yanıt vermedi'), 'timeout: timeout message');
    await noRawText(page, 'timeout');
    await shot(page, '14-vehicles-timeout');
    await context.close();
  }

  await browser.close();
  if (failures) {
    console.error(`verify-web-errors: ${failures} failure(s)`);
    process.exit(1);
  }
  console.log('verify-web-errors: all checks passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
