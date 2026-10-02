// Focus ring on form controls: mouse click vs keyboard Tab.
// The API is mocked with page.route — no backend, no database is touched.
// Usage: node capture.mjs <before|after>   (BASE = vite dev server)
import { chromium } from '../../../web/node_modules/playwright/index.mjs';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const OUT = path.dirname(fileURLToPath(import.meta.url));
const PHASE = process.argv[2] ?? 'after';
const BASE = process.env.BASE ?? 'http://localhost:5175';

const user = { ID: 9001, FullName: 'Fixture Admin', Email: 'fixture@example.invalid', Role: 'ADMIN', IsActive: true };
const permissions = ['web.access', 'admin.manage_masters', 'vehicle.view', 'issue.view'];
const templates = [{ ID: 2, VehicleModelID: null, Type: 'SHIPMENT', Name: 'Sevk', IsActive: true, ItemCount: 3 }];
const items = [
  { ID: 21, TemplateID: 2, ItemNo: 1, ItemText: 'Şasi numarası kontrolü', StationID: null, EolPhase: null, SectionKey: 'identity', SectionSort: 10, IsActive: true },
  { ID: 22, TemplateID: 2, ItemNo: 2, ItemText: 'Boya ve kaporta kontrolü', StationID: null, EolPhase: null, SectionKey: 'exterior', SectionSort: 20, IsActive: true },
  { ID: 23, TemplateID: 2, ItemNo: 3, ItemText: 'Pasif örnek madde', StationID: null, EolPhase: null, SectionKey: 'interior', SectionSort: 30, IsActive: false },
];
const impact = { Affected: 4, Protected: 1, Action: 'activate', NotStartedAffected: 3, NotStartedProtected: 0, IncompleteAffected: 4, IncompleteProtected: 1 };

function mock(route) {
  const req = route.request();
  const url = new URL(req.url());
  if (req.method() !== 'GET') return route.fulfill({ status: 405, json: { error: 'read-only mock' } });
  let body = { items: [] };
  if (url.pathname.endsWith('/checklist-templates')) body = { items: templates };
  else if (/\/checklist-templates\/2\/items$/.test(url.pathname)) body = { items };
  else if (url.pathname.endsWith('/impact')) body = impact;
  return route.fulfill({ status: 200, json: body });
}

const browser = await chromium.launch({ headless: true });
const facts = {};

async function open(withSession) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
  await context.route('**/api/v1/**', mock);
  await context.addInitScript(
    ({ data, withSession }) => {
      if (withSession) localStorage.setItem('karea.auth.session', JSON.stringify(data));
      localStorage.setItem('karea-theme-mode', 'light');
      localStorage.setItem('karea-locale', 'tr');
    },
    { data: { token: 'mock-token', user, permissions }, withSession },
  );
  return context.newPage();
}

async function measure(target) {
  return target.evaluate((el) => {
    const cs = getComputedStyle(el);
    return {
      focused: document.activeElement === el,
      focusVisible: el.matches(':focus-visible'),
      outline: `${cs.outlineStyle} ${cs.outlineWidth}`,
    };
  });
}

async function shot(page, target, name) {
  const box = await target.boundingBox();
  const pad = 28;
  await page.screenshot({
    path: path.join(OUT, `${PHASE}-${name}.png`),
    clip: { x: Math.max(box.x - pad, 0), y: Math.max(box.y - pad, 0), width: box.width + pad * 2 + 220, height: box.height + pad * 2 },
  });
}

async function tabTo(page, target) {
  for (let i = 0; i < 80; i++) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((el) => document.activeElement === el)) return true;
  }
  return false;
}

// Each scene: open a fresh page, mouse-click the control, then a fresh page and Tab to it.
const scenes = [
  {
    name: 'login-remember',
    session: false,
    url: '/login',
    target: (p) => p.locator('input.login-checkbox'),
  },
  {
    name: 'templates-hide-inactive',
    session: true,
    url: '/templates',
    prepare: async (p) => {
      await p.locator('tbody tr').first().click();
      await p.getByText('Pasif maddeleri gizle').waitFor();
    },
    target: (p) => p.getByLabel('Pasif maddeleri gizle'),
  },
  {
    name: 'templates-section-select',
    session: true,
    url: '/templates',
    prepare: async (p) => {
      await p.locator('tbody tr').first().click();
      await p.locator('select[aria-label="Bölüm"]').first().waitFor();
    },
    target: (p) => p.locator('select[aria-label="Bölüm"]').first(),
  },
  {
    name: 'propagate-radio',
    session: true,
    url: '/templates',
    prepare: async (p) => {
      await p.locator('tbody tr').first().click();
      await p.getByRole('button', { name: 'Aktife al' }).first().click();
      await p.locator('input[name="propagation-scope"]').first().waitFor();
    },
    // Tab enters a radio group on the checked option only.
    target: (p) => p.locator('input[name="propagation-scope"]:checked'),
  },
  // Text fields keep their ring on click: browsers match :focus-visible for text entry.
  {
    name: 'templates-text-input',
    session: true,
    url: '/templates',
    prepare: async (p) => {
      await p.locator('tbody tr').first().click();
      await p.getByPlaceholder('Madde metni').waitFor();
    },
    target: (p) => p.getByPlaceholder('Madde metni'),
  },
];

for (const s of scenes) {
  for (const mode of ['click', 'tab']) {
    const page = await open(s.session);
    await page.goto(`${BASE}${s.url}`, { waitUntil: 'networkidle' });
    if (s.prepare) await s.prepare(page);
    await page.waitForTimeout(300);
    const target = s.target(page);
    await target.scrollIntoViewIfNeeded();
    if (mode === 'click') {
      await target.click();
      await page.mouse.move(5, 5);
    } else {
      if (!(await tabTo(page, target))) throw new Error(`${s.name}: Tab never reached the control`);
    }
    await page.waitForTimeout(250);
    facts[`${s.name}/${mode}`] = await measure(target);
    await shot(page, target, `${s.name}-${mode}`);
    await page.context().close();
  }
}

fs.writeFileSync(path.join(OUT, `${PHASE}-facts.json`), JSON.stringify(facts, null, 1));
for (const [k, v] of Object.entries(facts)) {
  console.log(`${PHASE} ${k.padEnd(32)} focused=${v.focused} focus-visible=${v.focusVisible} outline=${v.outline}`);
}
await browser.close();
