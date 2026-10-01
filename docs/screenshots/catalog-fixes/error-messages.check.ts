/**
 * Shows the on-screen text (TR / EN) for the catalogue rejections the API
 * returns, through the same translateApiError path web and mobile use.
 * shared/ uses extensionless imports, so bundle first:
 *   ../../../web/node_modules/.bin/esbuild error-messages.check.ts --bundle \
 *     --platform=node --format=esm --outfile=/tmp/error-messages.check.mjs
 *   node /tmp/error-messages.check.mjs
 */
import { translate, translateApiError } from '../../../shared/i18n';
import type { Locale } from '../../../shared/i18n/types';

const backend = [
  "selected part's zone is inactive",
  'parts cannot be added to an inactive zone',
  'the Other catalogue rows are protected',
  'selected catalogue item is inactive',
  'selected process is inactive',
];

let failed = 0;
for (const locale of ['tr', 'en'] as Locale[]) {
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) =>
    translate(locale, key, vars);
  for (const msg of backend) {
    const err = Object.assign(new Error(msg), { status: 400 });
    const shown = translateApiError(t, err);
    const generic = shown === t('error.badRequest');
    if (generic) failed++;
    console.log(`${locale} | ${msg} -> ${shown}${generic ? '   <-- FAIL: generic' : ''}`);
  }
}
console.log(failed ? `FAIL (${failed})` : 'ok: every rejection has a specific message');
process.exit(failed ? 1 : 0);
