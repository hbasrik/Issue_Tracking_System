#!/usr/bin/env node
/**
 * Behavioural check of shared/i18n/errors.ts: every error a client can show
 * is translated (TR + EN), raw backend / browser text never leaks, and the
 * request code appears only for 5xx.
 *
 * Bundles the TypeScript with the esbuild copy shipped in web/node_modules.
 */
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'web/package.json'));
const esbuild = require('esbuild');

const out = await esbuild.build({
  entryPoints: [join(root, 'shared/i18n/index.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
});
const mod = await import(
  'data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64')
);
const { translate, translateApiError, describeApiError, tr, en } = mod;

class ApiError extends Error {
  constructor(status, body) {
    super(body?.error ?? `HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

let failures = 0;
function check(cond, msg) {
  if (!cond) {
    failures++;
    console.error('FAIL:', msg);
  } else {
    console.log('ok  ', msg);
  }
}

const trT = (k, v) => translate('tr', k, v);
const enT = (k, v) => translate('en', k, v);

const cases = [
  ['offline (fetch TypeError)', new TypeError('Failed to fetch'), 'error.offline'],
  ['offline (status 0)', new ApiError(0, { error: 'network unavailable' }), 'error.offline'],
  ['timeout (status 0)', new ApiError(0, { error: 'request timed out' }), 'error.timeout'],
  ['timeout (408)', new ApiError(408, { error: 'request timeout' }), 'error.timeout'],
  ['500', new ApiError(500, { error: 'internal server error', request_id: 'abc123' }), 'error.server'],
  ['502 html', new ApiError(502, { error: 'HTTP 502' }), 'error.server'],
  ['400 malformed', new ApiError(400, { error: 'invalid JSON body: unexpected EOF' }), 'error.badRequest'],
  ['400 unknown', new ApiError(400, { error: 'limit must be between 1 and 200' }), 'error.badRequest'],
  ['404', new ApiError(404, { error: 'entity not found' }), 'error.notFound'],
  ['409 raw trigger', new ApiError(409, { error: 'something the trigger said' }), 'error.conflict'],
  ['413', new ApiError(413, { error: 'http: request body too large' }), 'error.tooLarge'],
  ['401', new ApiError(401, { error: 'missing bearer token' }), 'error.invalidToken'],
  ['sentinel wrapped', new ApiError(409, { error: 'invalid status transition: vehicle status changes only via EoL workflow or hold actions' }), 'error.invalidTransition'],
  ['sentinel hold', new ApiError(409, { error: 'vehicle cannot be placed on hold from its current status' }), 'error.holdNotAllowed'],
  ['sentinel catalog', new ApiError(409, { error: 'catalogue code already exists' }), 'error.catalogCodeTaken'],
  ['template in use', new ApiError(409, { error: "bu madde 3 araçta değerlendirilmiş veya issue'ya bağlı, silinemez — pasife çekebilirsiniz" }), 'error.templateItemInUse'],
  ['catalog in use', new ApiError(409, { error: 'bu parça 7 kayıtta kullanılmış, silinemez — pasife çekebilirsiniz' }), 'error.catalogInUse'],
  ['propagation empty', new ApiError(409, { error: 'catalogue item created but scope "not_started" matched 0 vehicles; 4 assigned vehicle(s) still missing it — choose incomplete or backfill' }), 'error.propagationEmpty'],
  ['gate missing', new ApiError(409, { error: 'EOL gate blocked: 2 item(s) not yet on the vehicle (item ids: 4, 5)' }), 'error.gateBlockedGeneric'],
  ['branch ship', new ApiError(409, { error: 'branch ship blocked for VIN123: 2 gate(s) incomplete' }), 'error.branchShipBlocked'],
  ['db trigger', new ApiError(409, { error: 'Cannot ship vehicle VIN123 from branch — test checklist is not fully OK/CONDITIONAL_OK' }), 'error.dbVehicleGate'],
];

for (const [name, err, key] of cases) {
  for (const [loc, t, table] of [['tr', trT, tr], ['en', enT, en]]) {
    const got = describeApiError(t, err).message;
    const template = table[key];
    const prefix = template.split('{')[0];
    check(template && got.startsWith(prefix), `${loc} ${name} → ${key}: "${got}"`);
    check(got !== err.message || template === err.message, `${loc} ${name} does not echo raw text`);
  }
}

// Request code only for 5xx
const e500 = new ApiError(500, { error: 'internal server error', request_id: 'req-5xx-1' });
const e400 = new ApiError(400, { error: 'bad', request_id: 'req-4xx-1' });
check(translateApiError(trT, e500).includes('Hata kodu: req-5xx-1'), '5xx shows "Hata kodu"');
check(translateApiError(enT, e500).includes('Error code: req-5xx-1'), '5xx shows "Error code" (en)');
check(!translateApiError(trT, e400).includes('req-4xx-1'), '4xx hides request id');

// Client-built errors already carry translated copy and pass through.
check(
  describeApiError(trT, new Error('Yerel çeviri')).message === 'Yerel çeviri',
  'client-built Error passes through',
);

if (failures) {
  console.error(`verify-api-error-copy: ${failures} failure(s)`);
  process.exit(1);
}
console.log('verify-api-error-copy: all checks passed');
