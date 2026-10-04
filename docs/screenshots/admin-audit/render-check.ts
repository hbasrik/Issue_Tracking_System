/**
 * Renders every management row of api-activity-manager.json through the web
 * Activity formatter in TR and EN and fails on any raw stored value.
 * Run: web/node_modules/.bin/esbuild docs/screenshots/admin-audit/render-check.ts \
 *   --bundle --platform=node --format=esm --outfile=/tmp/arc.mjs && node /tmp/arc.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { translate, type Locale, type MessageKey } from '../../../shared/i18n';
import { isAdminAuditEvent } from '../../../shared/adminAudit';
import { activityDetailLine } from '../../../web/src/lib/activityDetail';
import type { HomeActivityEntry } from '../../../web/src/lib/api';

const dir = 'docs/screenshots/admin-audit';
const page = JSON.parse(readFileSync(`${dir}/api-activity-manager.json`, 'utf8')) as { Items: HomeActivityEntry[] };
const rows = page.Items.filter((r) => isAdminAuditEvent(r.EventType));

const RAW = [
  /\btrue\b/, /\bfalse\b/, /\bBRANCH\b/, /\bDEPOT\b/, /\b[a-z]+_[a-z_]+\b/, /\b[A-Z]+_[A-Z_]+\b/,
  /\b[a-z]+\.[a-z_.]+\b/, /\bundefined\b/, /\bnull\b/, /\bNaN\b/, /Bilinmeyen değer/, /Unknown value/,
  /\[object/, /\{[a-z]+\}/,
];
const ALLOWED = [/@karea\.local/];

let bad = 0;
const out: string[] = [];
for (const locale of ['tr', 'en'] as Locale[]) {
  const t = (key: MessageKey, vars?: Record<string, string | number>) => translate(locale, key, vars);
  out.push(`== ${locale} (${rows.length} rows)`);
  for (const r of rows) {
    const line = activityDetailLine(r, t, locale);
    const scan = ALLOWED.reduce((s, re) => s.replace(new RegExp(`\\S*${re.source}`, 'g'), ''), line);
    const hit = RAW.find((re) => re.test(scan));
    if (hit) bad += 1;
    out.push(`${hit ? 'RAW ' + hit + ' ' : ''}${r.EventType}: ${line}`);
  }
}
out.push(bad === 0 ? 'NO RAW VALUES' : `RAW VALUES FOUND: ${bad}`);
writeFileSync(`${dir}/render-check-output.txt`, out.join('\n') + '\n');
console.log(out.join('\n'));
process.exit(bad === 0 ? 0 : 1);
