/**
 * Anchored (portaled) dropdown verification: Issues part filter, Analysis VIN
 * multi-select, report-form VIN search. Read-only against the API; the caller
 * supplies a login (use a temp user so no real hash is silently rehashed).
 *
 *   cd web && KAREA_EMAIL=... KAREA_PASSWORD=... node ../scripts/verify-anchored-popover.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import pw from '../web/node_modules/playwright/index.js';
const { chromium } = pw;

const API = process.env.VITE_API_BASE_URL || 'http://localhost:8080/api/v1';
const WEB = process.env.WEB_BASE || 'http://localhost:5173';
const EMAIL = process.env.KAREA_EMAIL;
const PASS = process.env.KAREA_PASSWORD;
const OUT = path.resolve('../docs/screenshots/anchored-dropdown');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
  console.log(`ok  ${msg}`);
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

const panelSel = 'body > div[data-placement]';

async function panelBox(page) {
  return page.locator(panelSel).boundingBox();
}

/** True when the given option's center is hit-testable (not clipped/covered). */
async function optionHittable(page, optionSel, index) {
  return page.evaluate(
    ([sel, i]) => {
      const el = document.querySelectorAll(sel)[i];
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return Boolean(hit && el.contains(hit));
    },
    [optionSel, index],
  );
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const session = await login();
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addInitScript(
    ([s]) => {
      localStorage.setItem('karea.auth.session', JSON.stringify(s));
      localStorage.setItem('karea-issues-advanced-filters-open', '1');
      localStorage.setItem('karea-locale', 'tr');
    },
    [{ token: session.token, user: session.user, permissions: session.permissions }],
  );
  const page = await context.newPage();

  // --- 1) Issues: part list fully visible inside the overflow-hidden filter card
  await page.goto(`${WEB}/issues`);
  const trigger = page.getByRole('button', { name: /Parça seç/ });
  await trigger.waitFor();
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  await page.locator(panelSel).waitFor();
  const opts = `${panelSel} [role="option"]`;
  const optCount = await page.locator(opts).count();
  assert(optCount > 3, `part list shows ${optCount} options (was clipped to 1)`);
  const tBox = await trigger.boundingBox();
  const pBox = await panelBox(page);
  const card = await page.evaluate(() => {
    const t = [...document.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Parça seç'),
    );
    let el = t?.parentElement;
    while (el && getComputedStyle(el).overflow !== 'hidden') el = el.parentElement;
    const r = el?.getBoundingClientRect();
    return r ? { bottom: r.bottom } : null;
  });
  assert(Boolean(card), 'filter card still has overflow:hidden ancestor (root cause present)');
  console.log(
    `    panel bottom=${(pBox.y + pBox.height).toFixed(1)} card bottom=${card.bottom.toFixed(1)}`,
  );
  assert(await optionHittable(page, opts, 3), '4th option is hit-testable (not clipped)');
  assert(
    Math.abs(pBox.y - (tBox.y + tBox.height + 4)) <= 1.5,
    `panel sits under trigger (panel.y=${pBox.y.toFixed(1)} trigger.bottom=${(tBox.y + tBox.height).toFixed(1)})`,
  );
  assert(pBox.y + pBox.height <= 800, 'panel stays inside the viewport');
  await page.screenshot({ path: `${OUT}/01-issues-part-open-below.png` });

  // --- 2) Scroll keeps alignment
  await page.evaluate(() => {
    document.querySelector('[data-app-scroll]')?.scrollBy(0, 60);
  });
  await page.waitForTimeout(120);
  const tBox2 = await trigger.boundingBox();
  const pBox2 = await panelBox(page);
  const placement2 = await page.locator(panelSel).getAttribute('data-placement');
  const aligned =
    placement2 === 'below'
      ? Math.abs(pBox2.y - (tBox2.y + tBox2.height + 4))
      : Math.abs(pBox2.y + pBox2.height - (tBox2.y - 4));
  assert(
    Math.abs(tBox2.y - tBox.y) > 10,
    `trigger actually moved on scroll (${tBox.y.toFixed(1)} → ${tBox2.y.toFixed(1)})`,
  );
  assert(aligned <= 1.5, `panel follows trigger after scroll (offset ${aligned.toFixed(2)}px)`);
  assert(Math.abs(pBox2.x - tBox2.x) <= 1.5, 'panel left edge matches trigger');
  await page.screenshot({ path: `${OUT}/02-issues-part-after-scroll.png` });

  // --- 3) Outside click closes
  await page.mouse.click(5, 790);
  await page.waitForTimeout(80);
  assert((await page.locator(panelSel).count()) === 0, 'outside click closes the list');

  // --- 4) Keyboard: ArrowDown opens, arrows move, Enter selects, Esc closes
  await trigger.focus();
  await page.keyboard.press('ArrowDown');
  await page.locator(panelSel).waitFor();
  const search = page.locator(`${panelSel} input[type="search"]`);
  assert(await search.evaluate((el) => el === document.activeElement), 'search input focused on open');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  const activeId = await search.getAttribute('aria-activedescendant');
  const activeLabel = await page.locator(`[id="${activeId}"] span.truncate`).innerText();
  assert(
    (await page.locator(`[id="${activeId}"]`).getAttribute('data-index')) === '2',
    `ArrowDown ×2 → third option active (“${activeLabel.trim()}”)`,
  );
  await page.keyboard.press('Enter');
  assert(
    (await page.locator(`[id="${activeId}"]`).getAttribute('aria-selected')) === 'true',
    'Enter toggles the active option on',
  );
  await page.screenshot({ path: `${OUT}/03-issues-part-keyboard-select.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(80);
  assert((await page.locator(panelSel).count()) === 0, 'Escape closes the list');
  assert(
    await trigger.evaluate((el) => el === document.activeElement),
    'focus returns to trigger after Escape',
  );
  const chip = page.locator('span.rounded-full', { hasText: activeLabel.trim() }).first();
  assert(await chip.isVisible(), 'selected part shows as chip');
  await chip.locator('button').click();

  // --- 5) Near the bottom of the viewport: list opens upward
  const tNow = await trigger.boundingBox();
  const h = Math.round(tNow.y + tNow.height + 70);
  await page.setViewportSize({ width: 1280, height: h });
  await page.waitForTimeout(150);
  await trigger.click();
  await page.locator(panelSel).waitFor();
  const placementUp = await page.locator(panelSel).getAttribute('data-placement');
  const tUp = await trigger.boundingBox();
  const pUp = await panelBox(page);
  assert(placementUp === 'above', `viewport h=${h}: list opens upward (placement=${placementUp})`);
  assert(pUp.y >= 0 && Math.abs(pUp.y + pUp.height - (tUp.y - 4)) <= 1.5, 'upward panel ends at trigger top');
  assert(await optionHittable(page, opts, 2), 'upward list options hit-testable');
  await page.screenshot({ path: `${OUT}/04-issues-part-open-above.png` });
  await page.keyboard.press('Escape');

  // --- 6) Long list scrolls internally, page is not clipped
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(150);
  await trigger.click();
  await page.locator(panelSel).waitFor();
  const scrollInfo = await page.evaluate((sel) => {
    const lb = document.querySelector(`${sel} [role="listbox"]`);
    return { sh: lb.scrollHeight, ch: lb.clientHeight, oy: getComputedStyle(lb).overflowY };
  }, panelSel);
  assert(
    scrollInfo.oy === 'auto' && scrollInfo.sh > scrollInfo.ch,
    `long list scrolls inside (scrollHeight ${scrollInfo.sh} > clientHeight ${scrollInfo.ch})`,
  );
  await page.keyboard.press('Escape');

  // --- 7) Analysis VIN multi-select inside overflow-x-auto filter bar
  const vins = await fetch(`${API}/vehicles?limit=1`, {
    headers: { Authorization: `Bearer ${session.token}` },
  }).then((r) => r.json());
  const sampleVin = (vins.Items ?? vins.items ?? [])[0]?.VIN;
  assert(Boolean(sampleVin), `sample VIN available (${sampleVin})`);
  await page.goto(`${WEB}/analysis`);
  const vinInput = page.getByRole('combobox', { name: 'Analiz VIN çoklu seçim' });
  await vinInput.waitFor();
  await vinInput.fill(sampleVin.slice(-3));
  await page.locator(panelSel).waitFor();
  await page.locator(`${panelSel} [role="option"]`).first().waitFor();
  const bar = await page.getByTestId('analysis-filters').boundingBox();
  const vBox = await panelBox(page);
  assert(vBox.y + vBox.height > bar.y + bar.height, 'VIN list extends below the filter bar');
  assert(
    await optionHittable(page, `${panelSel} [role="option"]`, 0),
    'VIN suggestion hit-testable outside the bar',
  );
  await page.screenshot({ path: `${OUT}/05-analysis-vin-open.png` });
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
  assert(
    (await page.getByTestId('analysis-filters').locator('li').count()) >= 1,
    'Analysis VIN: keyboard Enter adds chip',
  );

  // --- 8) Report form VIN search (unchanged component) is not clipped
  await page.goto(`${WEB}/issues/new`);
  const reportVin = page.getByPlaceholder('Araç ara / seç').first();
  if (await reportVin.count()) {
    await reportVin.fill(sampleVin.slice(-3));
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/06-report-vin-search.png` });
    console.log('ok  report form VIN search screenshot taken');
  } else {
    console.log('skip report form VIN input not found');
  }

  await browser.close();
  console.log('ALL CHECKS PASSED');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
