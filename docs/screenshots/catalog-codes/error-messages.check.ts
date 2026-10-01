/**
 * Shows the on-screen text (TR / EN) for the error strings the API actually
 * returned in run-verification.py (server-errors.json), through the same
 * translateApiError path web and mobile use.
 *   ../../../web/node_modules/.bin/esbuild error-messages.check.ts --bundle \
 *     --platform=node --format=esm --outfile=/tmp/codes-error-messages.check.mjs
 *   node /tmp/codes-error-messages.check.mjs server-errors.json
 */
import fs from 'node:fs';
import { translate, translateApiError } from '../../../shared/i18n';
import type { Locale } from '../../../shared/i18n/types';

const recorded = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')) as Record<
  string,
  { status: number; error: string }
>;
const unique = new Map<string, number>();
for (const { status, error } of Object.values(recorded)) unique.set(error, status);

let failed = 0;
for (const locale of ['tr', 'en'] as Locale[]) {
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) =>
    translate(locale, key, vars);
  for (const [msg, status] of unique) {
    const shown = translateApiError(t, Object.assign(new Error(msg), { status }));
    const generic = shown === t('error.badRequest') || shown === t('error.conflict');
    if (generic) failed++;
    console.log(`${locale} | ${status} ${msg}\n     -> ${shown}${generic ? '   <-- FAIL: generic' : ''}`);
  }
}
console.log(failed ? `FAIL (${failed})` : 'ok: every rejection has a specific message');
process.exit(failed ? 1 : 0);
