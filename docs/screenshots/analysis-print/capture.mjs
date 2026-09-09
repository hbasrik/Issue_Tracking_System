/**
 * Capture Analysis print PDFs + per-page PNGs for visual QA.
 * Variants: unfiltered TR, filtered TR, dark-theme TR, unfiltered EN.
 */
import { chromium } from '../../../web/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname);
const BASE = process.env.WEB_URL || 'http://localhost:5173';
const API = process.env.API_URL || 'http://localhost:8080/api/v1';
const AUTH_KEY = 'karea.auth.session';

fs.mkdirSync(OUT, { recursive: true });

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

async function gotoAnalysis(page, query = '') {
  const dashWait = page.waitForResponse(
    (r) => r.url().includes('/analysis/dashboard') && r.ok(),
    { timeout: 45_000 },
  );
  await page.goto(`${BASE}/analysis${query}`, { waitUntil: 'domcontentloaded' });
  try {
    await dashWait;
  } catch (err) {
    const body = await page.locator('body').innerText();
    console.error('dashboard wait failed; body snippet:\n', body.slice(0, 1200));
    await page.screenshot({
      path: path.join(OUT, 'debug-analysis.png'),
      fullPage: true,
    });
    throw err;
  }
  await page.waitForTimeout(1500);
  const states = await page.evaluate(() =>
    [...document.querySelectorAll('button')].map((b) => ({
      text: (b.textContent || '').trim().slice(0, 40),
      disabled: b.disabled,
    })),
  );
  console.log('buttons', JSON.stringify(states.filter((b) => /Yazdır|Print|CSV|Export/i.test(b.text))));
}

async function capturePrint(page, stem) {
  await page.evaluate(() => {
    window.__printCalled = false;
    window.print = () => {
      window.__printCalled = true;
    };
  });

  const printBtn = page.getByRole('button', { name: /Yazdır|Print/i }).first();
  await printBtn.click();
  await page.waitForFunction(
    () => document.body.dataset.print === 'analysis',
    null,
    { timeout: 15_000 },
  );
  await page.waitForTimeout(900);
  await page.emulateMedia({ media: 'print' });

  const pdfPath = path.join(OUT, `${stem}.pdf`);
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '14mm', right: '12mm', bottom: '18mm', left: '12mm' },
  });

  const py = `
import fitz
doc = fitz.open(${JSON.stringify(pdfPath)})
stem = ${JSON.stringify(path.join(OUT, stem))}
print("pages", doc.page_count)
for i, page in enumerate(doc):
    pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
    out = f"{stem}-page-{i+1:02d}.png"
    pix.save(out)
    print(out, pix.width, pix.height)
`;
  console.log(execFileSync('python3', ['-c', py], { encoding: 'utf8' }).trim());

  await page.evaluate(() => {
    delete document.body.dataset.print;
  });
  await page.emulateMedia({ media: 'screen' });
  return pdfPath;
}

const session = await apiLogin();
const browser = await chromium.launch({ headless: true });

async function withPrefs(locale, theme, run) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    deviceScaleFactor: 1,
  });
  await context.addInitScript(
    ({ key, data, locale, theme }) => {
      localStorage.setItem(key, JSON.stringify(data));
      localStorage.setItem('karea-locale', locale);
      localStorage.setItem('karea-theme-mode', theme);
    },
    {
      key: AUTH_KEY,
      data: {
        token: session.token,
        user: session.user,
        permissions: session.permissions,
      },
      locale,
      theme,
    },
  );
  const page = await context.newPage();
  try {
    await run(page);
  } finally {
    await context.close();
  }
}

try {
  await withPrefs('tr', 'light', async (page) => {
    await gotoAnalysis(page, '');
    console.log('capturing unfiltered-tr');
    await capturePrint(page, 'unfiltered-tr');

    await gotoAnalysis(page, '?from=2026-09-01&to=2026-09-08&lifecycle=AT_DEPOT');
    console.log('capturing filtered-tr');
    await capturePrint(page, 'filtered-tr');
  });

  await withPrefs('tr', 'dark', async (page) => {
    await gotoAnalysis(page, '');
    await page.waitForFunction(
      () => document.documentElement.dataset.theme === 'dark',
      null,
      { timeout: 10_000 },
    );
    console.log('capturing dark-tr');
    await capturePrint(page, 'dark-tr');
  });

  await withPrefs('en', 'light', async (page) => {
    await gotoAnalysis(page, '');
    await page.waitForFunction(
      () => document.documentElement.lang === 'en',
      null,
      { timeout: 10_000 },
    );
    console.log('capturing unfiltered-en');
    await capturePrint(page, 'unfiltered-en');
  });

  console.log('done', OUT);
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await browser.close();
}
