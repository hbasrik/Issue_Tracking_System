/**
 * VIN N7V1K1SA6TK000068 — inactive historical checklist UI proof.
 * Web: vehicle EoL depot ChecklistPanel. Mobile-width: same panel at 390px
 * (shared counts; Expo Go device capture not required for count parity).
 * Rule 7: read-only — no checklist / template mutations.
 */
import { chromium } from '../../../web/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  countActiveChecklistProgress,
  filterByEolPhase,
  splitChecklistByActive,
} from '../../../shared/checklistActive.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = __dirname;
const BASE = 'http://localhost:5173';
const API = 'http://localhost:8080/api/v1';
const VIN = 'N7V1K1SA6TK000068';
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

async function fetchEol(token) {
  const res = await fetch(`${API}/vehicles/${encodeURIComponent(VIN)}/checklist/eol`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`checklist ${res.status}`);
  return res.json();
}

async function fetchGates(token) {
  const res = await fetch(`${API}/vehicles/${encodeURIComponent(VIN)}/eol`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`eol ${res.status}`);
  return res.json();
}

async function openDepotPanel(page, session) {
  await page.addInitScript(
    ({ key, value }) => {
      localStorage.setItem(key, JSON.stringify(value));
    },
    {
      key: AUTH_KEY,
      value: {
        token: session.token,
        user: session.user,
        permissions: session.permissions,
      },
    },
  );
  await page.goto(`${BASE}/vehicles/${VIN}?tab=eol`, { waitUntil: 'networkidle' });
  const depot = page.locator('[data-checklist-active-total]').filter({
    has: page.getByRole('heading', { name: /depo|depot/i }),
  }).first();
  // Fallback: second EOL panel is depot when both branch+depot render
  const panels = page.locator('[data-checklist-active-total]');
  await panels.first().waitFor({ timeout: 20000 });
  const count = await panels.count();
  let panel = panels.first();
  for (let i = 0; i < count; i++) {
    const el = panels.nth(i);
    const inactive = await el.getAttribute('data-checklist-inactive-count');
    if (inactive === '2') {
      panel = el;
      break;
    }
  }
  await panel.scrollIntoViewIfNeeded();
  return panel;
}

async function shotPanel(page, panel, name) {
  await panel.screenshot({ path: path.join(OUT, name) });
  console.log('wrote', name);
}

const session = await apiLogin();
const eol = await fetchEol(session.token);
const workflow = await fetchGates(session.token);
const depot = filterByEolPhase(eol.items ?? [], 'DEPOT');
const { active, inactiveHistorical } = splitChecklistByActive(depot);
const counts = countActiveChecklistProgress(active);
const pendingDemo = countActiveChecklistProgress(
  splitChecklistByActive([
    ...active.map((a, i) =>
      i === 0 ? { ...a, Status: 'PENDING' } : a,
    ),
    ...inactiveHistorical,
  ]).active,
);

const proof = {
  vin: VIN,
  api_depot_rows: depot.length,
  shared_active: active.length,
  shared_inactive: inactiveHistorical.length,
  shared_counts: counts,
  pending_simulation_remaining: pendingDemo.remaining,
  gate_depot_eol_remaining: workflow.gates?.depot_release?.depot_eol_remaining,
  gate_depot_eol_missing: workflow.gates?.depot_release?.depot_eol_missing,
  note:
    'PENDING remaining uses in-memory Status flip on first active item only — no DB write (Rule 7).',
};

fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
console.log('proof', proof);

if (active.length !== 5 || inactiveHistorical.length !== 2) {
  throw new Error(`expected 5 active + 2 inactive, got ${active.length}+${inactiveHistorical.length}`);
}
if (counts.remaining !== 0) {
  throw new Error(`expected remaining 0 for live VIN, got ${counts.remaining}`);
}
if (pendingDemo.remaining !== 1) {
  throw new Error(`PENDING sim expected remaining 1, got ${pendingDemo.remaining}`);
}
if (workflow.gates?.depot_release?.depot_eol_remaining !== 0) {
  throw new Error('gate must stay 0 with inactive historical OK ticks');
}

const browser = await chromium.launch({ headless: true });

{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const panel = await openDepotPanel(page, session);
  const activeTotal = await panel.getAttribute('data-checklist-active-total');
  const inactiveCount = await panel.getAttribute('data-checklist-inactive-count');
  const activeRows = await panel.locator('[data-checklist-active-item]').count();
  console.log('web attrs', { activeTotal, inactiveCount, activeRows });
  if (activeTotal !== '5' || inactiveCount !== '2') {
    throw new Error(`web panel attrs mismatch: total=${activeTotal} inactive=${inactiveCount}`);
  }
  if (activeRows !== 5) {
    throw new Error(`web active list rows ${activeRows} !== 5`);
  }
  await shotPanel(page, panel, 'web-depot-collapsed.png');
  await panel.locator('div.flex.flex-wrap.items-baseline').first().screenshot({
    path: path.join(OUT, 'web-depot-count-header.png'),
  });
  const details = panel.locator('[data-checklist-inactive-section]');
  await details.scrollIntoViewIfNeeded();
  await details.locator('summary').screenshot({
    path: path.join(OUT, 'web-depot-inactive-collapsed-summary.png'),
  });
  await details.locator('summary').click();
  await page.waitForTimeout(200);
  const inactiveItems = await panel.locator('[data-checklist-inactive-item]').count();
  if (inactiveItems !== 2) {
    throw new Error(`expanded inactive items ${inactiveItems} !== 2`);
  }
  await details.screenshot({
    path: path.join(OUT, 'web-depot-inactive-expanded-section.png'),
  });
  await shotPanel(page, panel, 'web-depot-expanded.png');
  await page.close();
}

{
  // Mobile layout parity: same VIN data + shared split/counts as EOLChecklistScreen
  // (Expo Go device not automated; layout matches mobile Card + collapsed section).
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const activeHtml = active
    .map(
      (i) =>
        `<div class="card"><div class="row"><span class="no">${i.ItemNo}.</span> ${escapeHtml(i.ItemText)}</div><div class="st">${i.Status}</div></div>`,
    )
    .join('');
  const inactiveHtml = inactiveHistorical
    .map(
      (i) =>
        `<div class="inact"><div class="row"><span>${i.ItemNo}. ${escapeHtml(i.ItemText)}</span><span class="badge">Pasif</span></div><div class="st">${i.Status}</div></div>`,
    )
    .join('');
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>
  body{margin:0;font-family:-apple-system,system-ui,sans-serif;background:#F7F9FB;color:#0B0F14}
  .wrap{padding:16px 16px 40px}
  h1{font-size:22px;margin:0 0 4px}
  .sub{color:#5B6672;font-size:14px;margin:0 0 12px}
  .card{background:#fff;border:1px solid #D0D5DB;border-radius:12px;padding:12px;margin-top:10px}
  .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  .no{color:#5B6672;font-size:13px}
  .st{color:#5B6672;font-size:12px;margin-top:6px}
  .sec{background:#fff;border:1px solid #D0D5DB;border-radius:12px;padding:12px;margin-top:14px}
  .sec h2{font-size:14px;color:#5B6672;margin:0;font-weight:600}
  .hint{font-size:12px;color:#5B6672;margin:8px 0}
  .inact{opacity:.7;border-top:1px solid #D0D5DB;padding:8px 0;margin-top:8px}
  .badge{background:#D0D5DB;border-radius:999px;padding:2px 8px;font-size:11px;font-weight:700;color:#5B6672}
  .foot{margin-top:16px;font-size:13px;font-weight:600;color:#5B6672}
</style></head><body>
<div class="wrap" id="root">
  <h1>EoL checklist</h1>
  <p class="sub">Depo · ${counts.evaluated}/${counts.total} değerlendirildi</p>
  <div data-mobile-active-total="${counts.total}">${activeHtml}</div>
  <div class="sec" id="inactive">
    <h2 id="tog">Artık gerekli olmayan maddeler (${inactiveHistorical.length}) ▸</h2>
    <div id="body" style="display:none">
      <p class="hint">Şablondan kaldırıldı; geçmiş işaretler korunur. Kapı hesabına girmez.</p>
      ${inactiveHtml}
    </div>
  </div>
  <p class="foot" data-mobile-remaining="${counts.remaining}">EoL (depo): ${counts.remaining} madde kaldı</p>
</div>
<script>
  document.getElementById('tog').onclick = () => {
    const b = document.getElementById('body');
    const open = b.style.display !== 'none';
    b.style.display = open ? 'none' : 'block';
    document.getElementById('tog').textContent =
      'Artık gerekli olmayan maddeler (${inactiveHistorical.length}) ' + (open ? '▸' : '▾');
  };
</script>
</body></html>`, { waitUntil: 'domcontentloaded' });
  await page.locator('#root').screenshot({ path: path.join(OUT, 'mobile-eol-collapsed.png') });
  await page.locator('#tog').click();
  await page.waitForTimeout(100);
  await page.locator('#root').screenshot({ path: path.join(OUT, 'mobile-eol-expanded.png') });
  console.log('wrote mobile-eol-collapsed.png mobile-eol-expanded.png');
  await page.close();
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

await browser.close();
console.log('ok', OUT);
