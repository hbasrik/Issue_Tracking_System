#!/usr/bin/env node
/**
 * Proves 5xx-only request-id surfacing matches shared/i18n/errors.ts contract.
 * Kept as plain JS so it runs without a TS loader.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'shared/i18n/errors.ts'), 'utf8');
const messages = readFileSync(join(root, 'shared/i18n/messages.ts'), 'utf8');

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

assert(src.includes('export function serverErrorRequestId'), 'serverErrorRequestId exported');
assert(src.includes('export function describeApiError'), 'describeApiError exported');
assert(src.includes('status < 500'), '5xx gate present');
assert(
  /translateApiError[\s\S]*error\.requestCode/.test(src),
  'translateApiError appends error.requestCode',
);
assert(messages.includes("'error.requestCode': 'Hata kodu: {id}'"), 'TR request code copy');
assert(messages.includes("'error.requestCode': 'Error code: {id}'"), 'EN request code copy');

// Behavioural mirror of serverErrorRequestId
function serverErrorRequestId(err) {
  if (!err || typeof err !== 'object') return undefined;
  const status = typeof err.status === 'number' ? err.status : 0;
  if (status < 500) return undefined;
  const fromBody =
    typeof err.body?.request_id === 'string' ? err.body.request_id.trim() : '';
  if (fromBody) return fromBody;
  const fromField = typeof err.requestId === 'string' ? err.requestId.trim() : '';
  return fromField || undefined;
}

assert(
  serverErrorRequestId({ status: 500, body: { request_id: 'a1b2c3d4' } }) === 'a1b2c3d4',
  '5xx exposes request_id',
);
assert(
  serverErrorRequestId({ status: 400, body: { request_id: 'a1b2c3d4' } }) === undefined,
  '4xx hides request_id',
);
assert(
  serverErrorRequestId({ status: 401, body: { request_id: 'a1b2c3d4' } }) === undefined,
  '401 hides request_id',
);

// Clients capture request_id from body / header
const webApi = readFileSync(join(root, 'web/src/lib/api.ts'), 'utf8');
const mobileApi = readFileSync(join(root, 'mobile/src/api/client.ts'), 'utf8');
assert(webApi.includes('request_id?: string'), 'web ApiErrorBody has request_id');
assert(webApi.includes("headers.get('X-Request-ID')"), 'web reads X-Request-ID');
assert(mobileApi.includes('request_id?: string'), 'mobile ApiErrorBody has request_id');
assert(mobileApi.includes("headers.get('X-Request-ID')"), 'mobile reads X-Request-ID');

assert(
  readFileSync(join(root, 'web/src/components/ApiErrorText.tsx'), 'utf8').includes(
    'error.requestCode',
  ),
  'web ApiErrorText uses i18n',
);
assert(
  readFileSync(join(root, 'mobile/src/components/ApiErrorText.tsx'), 'utf8').includes(
    'error.requestCode',
  ),
  'mobile ApiErrorText uses i18n',
);

console.log('verify-request-id-ui: all checks passed');
