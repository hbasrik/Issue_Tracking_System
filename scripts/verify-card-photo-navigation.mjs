/**
 * Issue cards: every spot (photo included) opens the detail page and no
 * fullscreen viewer opens on the card. Detail page fullscreen serves the
 * ORIGINAL upload (no ?thumb), proven by byte size and pixel dimensions.
 * Read-only against the running API + web dev server.
 *
 *   KAREA_EMAIL=... KAREA_PASSWORD=... ISSUE_ID=8 \
 *   ORIGINAL_BYTES=... ORIGINAL_W=... ORIGINAL_H=... \
 *   node scripts/verify-card-photo-navigation.mjs
 *
 * Use a temp user (a real seed login would silently rehash its password).
 */
import fs from 'node:fs';
import path from 'node:path';
import pw from '../web/node_modules/playwright/index.js';

const { chromium } = pw;
const API = process.env.VITE_API_BASE_URL || 'http://localhost:8080/api/v1';
const WEB = process.env.WEB_BASE || 'http://localhost:5173';
const ISSUE_ID = Number(process.env.ISSUE_ID || 8);
const ORIGINAL_BYTES = Number(process.env.ORIGINAL_BYTES);
const ORIGINAL_W = Number(process.env.ORIGINAL_W);
const ORIGINAL_H = Number(process.env.ORIGINAL_H);
const OUT = path.resolve('docs/screenshots/card-photo-navigation');
fs.mkdirSync(OUT, { recursive: true });

let failures = 0;
function check(cond, msg) {
  if (cond) console.log(`ok   ${msg}`);
  else {
    failures++;
    console.error(`FAIL ${msg}`);
  }
}

const login = await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: process.env.KAREA_EMAIL, password: process.env.KAREA_PASSWORD }),
}).then((r) => r.json());
const session = { token: login.token, user: login.user, permissions: login.permissions };
const issue = await fetch(`${API}/issues/${ISSUE_ID}`, {
  headers: { Authorization: `Bearer ${session.token}` },
}).then((r) => r.json());
check(Boolean(issue.ReportPhotoPath), `issue ${ISSUE_ID} has a report photo (${issue.ReportPhotoPath})`);

const browser = await chromium.launch({ headless: true });

async function openPage(width) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2 });
  await context.addInitScript((s) => {
    localStorage.setItem('karea.auth.session', JSON.stringify(s));
    localStorage.setItem('karea-locale', 'tr');
  }, session);
  const page = await context.newPage();
  const uploads = [];
  page.on('response', (res) => {
    const url = res.url();
    if (url.includes('/uploads/')) uploads.push({ url, status: res.status() });
  });
  return { context, page, uploads };
}

/** Card of ISSUE_ID on a list page, with its photo loaded. */
async function findCard(page) {
  // The board is virtualized; narrow it to this VIN so the card is rendered.
  const search = page.getByPlaceholder(/VIN veya bildiren/);
  if (await search.count()) {
    await search.first().fill(issue.VIN.slice(-5));
    await page.waitForTimeout(800);
  }
  const card = page.locator('article', { hasText: issue.Description.trim() }).first();
  await card.waitFor({ timeout: 20_000 });
  await card.scrollIntoViewIfNeeded();
  // Card photos are lazy: they load once the card is in the viewport.
  await card.locator('[data-testid="issue-card-photo"] img').waitFor({ timeout: 20_000 });
  return card;
}

const targets = [
  ['photo', (c) => c.getByTestId('issue-card-photo')],
  ['description', (c) => c.locator('p').first()],
  ['classification', (c) => c.locator('p').nth(1)],
  ['severity', (c) => c.locator('[data-severity-bars]')],
  ['chevron', (c) => c.locator('svg.lucide-chevron-right')],
];

async function listCase(route, label, width) {
  for (const [spot, locate] of targets) {
    const { context, page, uploads } = await openPage(width);
    await page.goto(`${WEB}${route}`);
    const card = await findCard(page);
    await card.scrollIntoViewIfNeeded();
    if (spot === 'photo') {
      await page.waitForTimeout(400);
      await card.screenshot({ path: path.join(OUT, `${label}-${width}-card.png`) });
      const cardUploads = uploads.filter((u) => u.url.includes(issue.ReportPhotoPath));
      console.log(`     card photo requests: ${cardUploads.map((u) => `${u.url.replace(/^.*\/uploads\//, '')} HTTP ${u.status}`).join(', ')}`);
      const cardImg = await card.locator('[data-testid="issue-card-photo"] img').evaluate(async (img) => {
        await img.decode().catch(() => {});
        const blob = await fetch(img.src).then((r) => r.blob());
        return { w: img.naturalWidth, h: img.naturalHeight, bytes: blob.size };
      });
      console.log(`     card image: ${cardImg.w}×${cardImg.h}, ${cardImg.bytes} bytes`);
      check(cardImg.bytes < ORIGINAL_BYTES && cardImg.w < ORIGINAL_W, `${label} ${width}px: card image is smaller than the original`);
      check(
        cardUploads.length > 0 && cardUploads.every((u) => u.url.includes('thumb=')),
        `${label} ${width}px: card shows a thumbnail derivative, never the original`,
      );
    }
    await locate(card).first().click();
    await page.waitForURL(new RegExp(`/issues/${ISSUE_ID}$`), { timeout: 10_000 }).catch(() => {});
    const url = page.url();
    const dialogs = await page.locator('[role="dialog"]').count();
    check(url.endsWith(`/issues/${ISSUE_ID}`), `${label} ${width}px: click ${spot} → detail (${new URL(url).pathname})`);
    check(dialogs === 0, `${label} ${width}px: click ${spot} opens no fullscreen viewer`);
    await context.close();
  }
}

await listCase('/issues', 'issues', 390);
await listCase('/issues', 'issues', 1280);
await listCase(`/vehicles/${issue.VIN}?tab=issues`, 'vehicle', 390);
await listCase(`/vehicles/${issue.VIN}?tab=issues`, 'vehicle', 1280);

// Detail page: fullscreen must be the original upload.
{
  const { context, page, uploads } = await openPage(1280);
  await page.goto(`${WEB}/issues/${ISSUE_ID}`);
  const thumb = page.locator(`button[aria-label*="${path.basename(issue.ReportPhotoPath).slice(0, 8)}"], li button:has(img)`).first();
  await thumb.waitFor({ timeout: 20_000 });
  await thumb.click();
  const dialog = page.locator('[role="dialog"] img');
  await dialog.waitFor({ timeout: 20_000 });
  await page.waitForFunction(() => {
    const img = document.querySelector('[role="dialog"] img');
    return img && img.complete && img.naturalWidth > 0;
  });
  const measured = await page.evaluate(async () => {
    const img = document.querySelector('[role="dialog"] img');
    const blob = await fetch(img.src).then((r) => r.blob());
    return { w: img.naturalWidth, h: img.naturalHeight, bytes: blob.size, type: blob.type };
  });
  const fetched = uploads.filter((u) => u.url.includes(issue.ReportPhotoPath));
  console.log(`     detail requests: ${fetched.map((u) => `${u.url.replace(/^.*\/uploads\//, '/uploads/')} HTTP ${u.status}`).join(', ')}`);
  console.log(`     fullscreen image: ${measured.w}×${measured.h}, ${measured.bytes} bytes (${measured.type})`);
  check(fetched.some((u) => !u.url.includes('thumb=')), 'detail requests the original URL (no ?thumb)');
  check(measured.bytes === ORIGINAL_BYTES, `fullscreen bytes ${measured.bytes} = original file ${ORIGINAL_BYTES}`);
  check(measured.w === ORIGINAL_W && measured.h === ORIGINAL_H, `fullscreen pixels ${measured.w}×${measured.h} = original ${ORIGINAL_W}×${ORIGINAL_H}`);
  await page.screenshot({ path: path.join(OUT, 'detail-fullscreen-1280.png') });
  await context.close();
}

await browser.close();
if (failures) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log('verify-card-photo-navigation: all checks passed');
