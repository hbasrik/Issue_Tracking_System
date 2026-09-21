/**
 * Issue card layout screenshots: 375 / 768 / 1024 / 1920.
 */
import { chromium } from '../../../web/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  formatIssueOpenDuration,
  issueCardColumnCount,
  issueOpenDurationMs,
  issueReportedAtIso,
} from '../../../shared/issueCardLayout.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = __dirname;
const BASE = 'http://localhost:5173';
const API = 'http://localhost:8080/api/v1';
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
  if (!res.ok) throw new Error(`login ${res.status}`);
  return res.json();
}

async function main() {
  const session = await apiLogin();
  const listRes = await fetch(`${API}/issues`, {
    headers: { Authorization: `Bearer ${session.token}` },
  });
  if (!listRes.ok) throw new Error(`list ${listRes.status}`);
  const { items } = await listRes.json();
  const now = Date.now();
  const sample =
    (items ?? []).find(
      (i) => i.Status === 'OPEN' || i.Status === 'IN_PROGRESS',
    ) ?? (items ?? [])[0];
  if (!sample) throw new Error('no issues in list');

  const reported = issueReportedAtIso(sample);
  const durationMs = issueOpenDurationMs(sample, now);
  const durationLabel = formatIssueOpenDuration(durationMs, 'tr');
  const metrics = {
    sampleId: sample.ID,
    description: (sample.Description || '').slice(0, 80),
    IssueDate: sample.IssueDate,
    CreatedAt: sample.CreatedAt,
    reportedAtUsed: reported,
    openDurationMs: durationMs,
    openDurationLabelTr: durationLabel,
    columnCounts: {
      375: issueCardColumnCount(375),
      768: issueCardColumnCount(768),
      1024: issueCardColumnCount(1024),
      1920: issueCardColumnCount(1920),
    },
  };

  const browser = await chromium.launch({ headless: true });
  const viewports = [
    { name: 'phone-375', width: 375, height: 812 },
    { name: 'tablet-portrait-768', width: 768, height: 1024 },
    { name: 'tablet-landscape-1024', width: 1024, height: 768 },
    { name: 'tv-1920', width: 1920, height: 1080 },
  ];

  for (const vp of viewports) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
    });
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
    await page.goto(`${BASE}/issues`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    await page.locator('article').first().waitFor({ state: 'visible', timeout: 20000 });
    await page.screenshot({
      path: path.join(OUT, `${vp.name}.png`),
      fullPage: false,
    });
    console.log('wrote', vp.name);

    if (vp.width === 1920) {
      const colCount = await page.evaluate(() => {
        const gridEl = document.querySelector('.grid');
        if (!gridEl) return -1;
        return getComputedStyle(gridEl)
          .gridTemplateColumns.split(' ')
          .filter(Boolean).length;
      });
      const heights = await page.evaluate(() =>
        [...document.querySelectorAll('article')]
          .slice(0, 8)
          .map((el) => Math.round(el.getBoundingClientRect().height)),
      );
      metrics.renderedColumns1920 = colCount;
      metrics.cardHeights1920 = heights;
      console.log('1920 columns:', colCount, 'heights', heights);
    }

    if (vp.width === 375) {
      // Crop to first few cards for phone layout proof
      await page.screenshot({
        path: path.join(OUT, 'phone-375-detail.png'),
        fullPage: false,
      });
    }

    await context.close();
  }

  const noPhoto = (items ?? []).find((i) => !i.ReportPhotoPath);
  if (noPhoto) {
    const context = await browser.newContext({
      viewport: { width: 1024, height: 900 },
    });
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
    await page.goto(`${BASE}/issues`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    // Clear status filter so OPEN-only doesn't hide older no-photo rows if needed —
    // issue 19 is OPEN; scroll until "Fotoğraf yok" is visible.
    const empty = page.getByText('Fotoğraf yok').first();
    // Expand list: click Açık chip off if it filters too hard — leave as-is and scroll.
    for (let i = 0; i < 40; i++) {
      if (await empty.isVisible().catch(() => false)) break;
      await page.mouse.wheel(0, 800);
      await page.waitForTimeout(150);
    }
    if (await empty.count()) {
      const card = empty.locator('xpath=ancestor::article[1]');
      await card.scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
      await card.screenshot({ path: path.join(OUT, 'no-photo-card.png') });
      metrics.noPhotoIssueId = noPhoto.ID;
      console.log('wrote no-photo-card id', noPhoto.ID);
    } else {
      console.log('Fotoğraf yok not found in DOM — full page fallback');
      await page.screenshot({
        path: path.join(OUT, 'no-photo-card.png'),
        fullPage: true,
      });
    }
    await context.close();
  } else {
    console.log('no issue without photo — skip');
  }

  fs.writeFileSync(path.join(OUT, 'metrics.json'), JSON.stringify(metrics, null, 2));
  await browser.close();
  console.log('metrics', metrics);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
