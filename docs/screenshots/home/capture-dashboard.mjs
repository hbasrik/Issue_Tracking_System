import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = __dirname;
const BASE = process.env.WEB_URL || 'http://localhost:5173';
const EMAIL = process.env.KAREA_EMAIL || 'manager@karea.local';
const PASS = process.env.KAREA_PASSWORD || 'changeme123';

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASS);
  await page.locator('input[type="checkbox"]').check();
  await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes('/auth/login') && r.ok(),
      { timeout: 15_000 },
    ),
    page.locator('button[type="submit"]').click(),
  ]);
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 15_000 });
  await page.waitForTimeout(1000);
}

async function applyTheme(page, theme) {
  await page.evaluate((mode) => {
    localStorage.setItem('karea-theme-mode', mode);
  }, theme);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(
    (mode) => document.documentElement.dataset.theme === mode,
    theme,
    { timeout: 10_000 },
  );
  await page.waitForTimeout(1500);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();

try {
  await login(page);
  console.log('logged in', page.url());

  await applyTheme(page, 'light');
  await page.screenshot({
    path: path.join(OUT, 'dashboard-1920-light.png'),
    fullPage: false,
  });
  console.log('wrote dashboard-1920-light.png');

  await applyTheme(page, 'dark');
  await page.screenshot({
    path: path.join(OUT, 'dashboard-1920-dark.png'),
    fullPage: false,
  });
  console.log('wrote dashboard-1920-dark.png');

  await applyTheme(page, 'light');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.screenshot({
    path: path.join(OUT, 'dashboard-tables-light.png'),
    fullPage: false,
  });
  console.log('wrote dashboard-tables-light.png');
} catch (err) {
  console.error(err);
  console.error('url', page.url());
  console.error(
    'body',
    (await page.locator('body').innerText().catch(() => '')).slice(0, 800),
  );
  await page.screenshot({
    path: path.join(OUT, 'capture-error.png'),
    fullPage: true,
  });
  process.exitCode = 1;
} finally {
  await browser.close();
}
