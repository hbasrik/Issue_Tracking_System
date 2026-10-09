/**
 * Management audit wording: every action of every entity reads as a sentence
 * with old → new values by name, in both languages, and no raw value (enum,
 * boolean, phase or permission code, role code) reaches the text.
 * Run: web/node_modules/.bin/esbuild shared/adminAudit.selftest.ts \
 *   --bundle --platform=node --format=esm --outfile=/tmp/aa.mjs && node /tmp/aa.mjs
 */
import assert from 'node:assert/strict';
import { translate, type Locale, type MessageKey } from './i18n';
import {
  adminAuditDetailLine,
  adminAuditEventLabel,
  ADMIN_AUDIT_EVENT_TYPES,
  type AdminAuditDetail,
  type AdminAuditLabelers,
} from './adminAudit';

const labels: AdminAuditLabelers = {
  permission: (code, description) =>
    code === 'admin.manage_users' ? 'Kullanıcı yönetimi' : description || 'İzin',
  role: (code, name) => (code === 'MANAGER_ADMIN' ? 'Yönetici' : name),
};

const user = { action: '', entity: 'user', subject: { tr: 'Mehmet Usta', en: 'Mehmet Usta' }, subject_email: 'mehmet@karea.local' };
const samples: AdminAuditDetail[] = [
  {
    ...user,
    action: 'create',
    changes: [
      { field: 'name', from: {}, to: { tr: 'Mehmet Usta', en: 'Mehmet Usta' } },
      { field: 'role', from: {}, to: { code: 'OPERATOR', tr: 'Operator', en: 'Operator' } },
      { field: 'is_active', from: {}, to: { code: 'true' } },
    ],
  },
  {
    ...user,
    action: 'role_change',
    changes: [
      { field: 'role', from: { code: 'OPERATOR', tr: 'Operator', en: 'Operator' }, to: { code: 'MANAGER_ADMIN', tr: 'Manager/Admin', en: 'Manager/Admin' } },
    ],
  },
  { ...user, action: 'deactivate', changes: [{ field: 'is_active', from: { code: 'true' }, to: { code: 'false' } }] },
  { ...user, action: 'password_reset' },
  { ...user, action: 'login_unlock' },
  { ...user, action: 'delete', changes: [{ field: 'email', from: { tr: 'mehmet@karea.local', en: 'mehmet@karea.local' }, to: {} }] },
  {
    action: 'grants_change',
    entity: 'role',
    subject: { code: 'QUALITY', tr: 'Kalite', en: 'Quality' },
    granted: [{ code: 'admin.manage_users', tr: 'Manage users', en: 'Manage users' }],
    revoked: [{ code: 'eol.document.approve', tr: 'Approve documents', en: 'Approve documents' }],
  },
  { action: 'create', entity: 'role', subject: { code: 'SHIFT_LEAD', tr: 'Vardiya Amiri', en: 'Vardiya Amiri' } },
  {
    action: 'update',
    entity: 'template_item',
    subject: { tr: 'Şarj kapağı', en: 'Şarj kapağı' },
    template_type: 'EOL',
    changes: [
      { field: 'item_text', from: { tr: 'Şarj kapağı', en: 'Şarj kapağı' }, to: { tr: 'Şarj kapağı kontrolü', en: 'Şarj kapağı kontrolü' } },
      { field: 'eol_phase', from: { code: 'BRANCH' }, to: { code: 'DEPOT' } },
      { field: 'section', from: {}, to: { code: 'final_extra_checks' } },
    ],
  },
  {
    action: 'reorder',
    entity: 'template_item',
    subject: {},
    template_type: 'TEST',
    moved: [{ subject: { tr: 'Paspas', en: 'Paspas' }, from: 3, to: 1 }],
  },
  {
    action: 'update',
    entity: 'part',
    subject: { code: '10-01', tr: 'Kapı', en: 'Door' },
    parent: { code: '20', tr: 'Şasi', en: 'Chassis' },
    changes: [
      { field: 'name', from: { tr: 'Kapı', en: 'Door' }, to: { tr: 'Ön kapı', en: 'Front door' } },
      { field: 'code', from: { code: '10-01' }, to: { code: '20-02' } },
      { field: 'zone', from: { code: '10', tr: 'Gövde', en: 'Body' }, to: { code: '20', tr: 'Şasi', en: 'Chassis' } },
      { field: 'sort_order', from: { code: '3' }, to: { code: '1' } },
    ],
  },
  {
    action: 'update',
    entity: 'defect_type',
    subject: { code: '02', tr: 'Boya', en: 'Paint' },
    changes: [{ field: 'default_process', from: {}, to: { code: 'ASSEMBLY', tr: 'Montaj', en: 'Assembly' } }],
  },
  { action: 'delete', entity: 'process', subject: { code: 'PAINT', tr: 'Boya', en: 'Paint' } },
  { action: 'reorder', entity: 'zone', subject: {}, moved: [{ subject: { code: '20', tr: 'Şasi', en: 'Chassis' }, from: 2, to: 1 }] },
];

const RAW = [
  /\btrue\b/, /\bfalse\b/, /\bBRANCH\b/, /\bDEPOT\b/, /\bfinal_adjust\b/, /\bMANAGER_ADMIN\b/,
  /\bOPERATOR\b/, /admin\.manage_users/, /eol\.document/, /\bgrants_change\b/, /\brole_change\b/,
  /\bpassword_reset\b/, /\btemplate_item\b/, /\bdefect_type\b/, /\bundefined\b/, /\bnull\b/,
  /Bilinmeyen değer/, /Unknown value/, /adminAudit\./, /activity\.filter/, /\bASSEMBLY\b/, /\bPAINT\b/,
  /\bQUALITY\b/, /\bSHIFT_LEAD\b/,
];

for (const locale of ['tr', 'en'] as Locale[]) {
  const t = (key: MessageKey, vars?: Record<string, string | number>) => translate(locale, key, vars);
  for (const d of samples) {
    const line = adminAuditDetailLine(d, t, locale, labels);
    for (const re of RAW) assert.ok(!re.test(line), `${locale}: raw value ${re} in "${line}"`);
    console.log(`${locale}: ${line}`);
  }
  for (const type of ADMIN_AUDIT_EVENT_TYPES) {
    const label = adminAuditEventLabel(type, t);
    assert.ok(!label.includes('_') && !label.includes('.'), `${locale}: event label ${label}`);
  }
}

const tr = (key: MessageKey, vars?: Record<string, string | number>) => translate('tr', key, vars);
const en = (key: MessageKey, vars?: Record<string, string | number>) => translate('en', key, vars);
assert.equal(
  adminAuditDetailLine(samples[1], tr, 'tr', labels),
  'Kullanıcı «Mehmet Usta (mehmet@karea.local)» — rolü değiştirildi · Rol: Operator → Yönetici',
);
assert.equal(
  adminAuditDetailLine(samples[3], en, 'en', labels),
  'User «Mehmet Usta (mehmet@karea.local)» — password reset',
);
assert.equal(
  adminAuditDetailLine(samples[2], tr, 'tr', labels),
  'Kullanıcı «Mehmet Usta (mehmet@karea.local)» — pasife alındı · Durum: Aktif → Pasif',
);
assert.ok(adminAuditDetailLine(samples[6], tr, 'tr', labels).includes('Verilen izin: Kullanıcı yönetimi'));
assert.ok(adminAuditDetailLine(samples[8], tr, 'tr', labels).includes('EoL aşaması: Fabrika → Depo'));
assert.ok(adminAuditDetailLine(samples[8], tr, 'tr', labels).includes('Bölüm: Diğer maddeler → Ek kontroller'));
assert.ok(adminAuditDetailLine(samples[10], en, 'en', labels).includes('Zone: Body (10) → Chassis (20)'));
assert.ok(adminAuditDetailLine(samples[10], tr, 'tr', labels).startsWith('Parça «Kapı (10-01)» (Şasi) — güncellendi'));
assert.ok(adminAuditDetailLine(samples[11], tr, 'tr', labels).includes('Varsayılan süreç: — → Montaj'));
assert.equal(
  adminAuditDetailLine(samples[9], tr, 'tr', labels),
  'Şablon maddesi (Test) — sıralama değiştirildi · Paspas: 3. sıradan 1. sıraya',
);
const trOnlyRename: AdminAuditDetail = {
  action: 'update',
  entity: 'part',
  subject: { code: '91-01', tr: 'Geçici parça', en: 'Temp part' },
  changes: [{ field: 'name', from: { tr: 'Geçici parça', en: 'Temp part' }, to: { tr: 'Geçici parça 2', en: 'Temp part' } }],
};
assert.ok(
  adminAuditDetailLine(trOnlyRename, en, 'en', labels).endsWith('Name: Geçici parça / Temp part → Geçici parça 2 / Temp part'),
  adminAuditDetailLine(trOnlyRename, en, 'en', labels),
);
assert.ok(adminAuditDetailLine(trOnlyRename, tr, 'tr', labels).endsWith('Ad: Geçici parça → Geçici parça 2'));
console.log('adminAudit selftest OK');
