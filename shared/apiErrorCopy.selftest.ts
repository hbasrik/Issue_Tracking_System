/**
 * Backend 409 texts for the depot release gate and frozen checklist items
 * (Karar 29) must translate to the copy that names the real reason, in both
 * languages.
 * Run: web/node_modules/.bin/esbuild shared/apiErrorCopy.selftest.ts \
 *   --bundle --platform=node --format=esm --outfile=/tmp/aec.mjs && node /tmp/aec.mjs
 */
import { translateApiError } from './i18n/errors';
import { translate } from './i18n/translate';

class FakeApiError extends Error {
  status = 409;
}

const cases: Array<{ msg: string; tr: string; en: string }> = [
  {
    msg: 'depot release blocked for N7V1K1SAXTK000011: 1 depot-phase EoL item(s) incomplete',
    tr: 'N7V1K1SAXTK000011 için depo çıkışı engellendi: 1 depo aşaması EOL maddesi tamamlanmadı.',
    en: 'Depot release blocked for N7V1K1SAXTK000011: 1 depot-phase EOL item(s) incomplete.',
  },
  {
    msg: 'depot release blocked for N7V1K1SA1TK000012: 2 open issue(s) remain (issue ids: 13, 14)',
    tr: 'N7V1K1SA1TK000012 için depo çıkışı engellendi: 2 açık issue kaldı (issue no: 13, 14).',
    en: 'Depot release blocked for N7V1K1SA1TK000012: 2 open Issue(s) remain (issue ids: 13, 14).',
  },
  {
    msg: 'depot release blocked for N7V1K1SA1TK000012: 4 depot-phase EoL item(s) incomplete; 2 open issue(s) remain (issue ids: 13, 14)',
    tr: 'N7V1K1SA1TK000012 için depo çıkışı engellendi: 4 depo aşaması EOL maddesi tamamlanmadı ve 2 açık issue kaldı (issue no: 13, 14).',
    en: 'Depot release blocked for N7V1K1SA1TK000012: 4 depot-phase EOL item(s) incomplete and 2 open Issue(s) remain (issue ids: 13, 14).',
  },
  {
    msg: 'depot release blocked for N7V1K1SAXTK000011: 0 open issue(s) remain (issue ids: )',
    tr: 'N7V1K1SAXTK000011 için depo çıkışı engellendi.',
    en: 'Depot release blocked for N7V1K1SAXTK000011.',
  },
  {
    msg: 'cannot change checklist items of a delivered vehicle',
    tr: translate('tr', 'error.checklistFrozenDelivered'),
    en: translate('en', 'error.checklistFrozenDelivered'),
  },
  {
    msg: 'cannot change branch-stage checklist items after the vehicle has shipped from the branch',
    tr: translate('tr', 'error.checklistFrozenBranchShipped'),
    en: translate('en', 'error.checklistFrozenBranchShipped'),
  },
  {
    msg: 'cannot change depot-stage EoL items after the vehicle has been released from the depot',
    tr: translate('tr', 'error.checklistFrozenDepotReleased'),
    en: translate('en', 'error.checklistFrozenDepotReleased'),
  },
];

const failures: string[] = [];
for (const c of cases) {
  for (const locale of ['tr', 'en'] as const) {
    const got = translateApiError((key, vars) => translate(locale, key, vars), new FakeApiError(c.msg));
    const want = c[locale];
    const ok = got === want && got !== c.msg && !/0 open issue/i.test(got);
    console.log(`[${ok ? 'PASS' : 'FAIL'}] ${locale} ${c.msg}\n       -> ${got}`);
    if (!ok) failures.push(`${locale}: ${c.msg}\n  got  ${got}\n  want ${want}`);
  }
}
if (failures.length) {
  console.error('\n' + failures.join('\n'));
  process.exit(1);
}
console.log(`apiErrorCopy ok (${cases.length * 2} translations)`);
