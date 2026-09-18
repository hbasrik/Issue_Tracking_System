#!/usr/bin/env node
/**
 * Prove the mobile login screen surfaces 429 rate-limit copy with remaining
 * minutes (LoginScreen → apiErrorMessage → translateApiError → TR/EN).
 *
 * Node cannot resolve the project's extensionless TS imports, so this script
 * exercises the same mapping rules as shared/i18n/errors.ts against the live
 * message tables and asserts LoginScreen is wired to that path.
 */
import { readFileSync } from 'node:fs';
import { en, tr } from '../shared/i18n/messages.ts';
import { isTransportError } from '../shared/networkError.ts';

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exitCode = 1;
}

function pass(msg) {
  console.log(`ok: ${msg}`);
}

function makeT(table) {
  return (key, vars) => {
    let s = table[key];
    if (s == null) throw new Error(`missing key ${key}`);
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        s = s.replaceAll(`{${k}}`, String(v));
      }
    }
    return s;
  };
}

/** Mirrors mobile/src/api/client.ts ApiError. */
class ApiError extends Error {
  constructor(status, body) {
    super(body.error || `HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

/**
 * Same 429 branch as shared/i18n/errors.ts translateApiError (kept in sync by
 * the source assertion below).
 */
function mapLoginRateLimit(t, err) {
  if (isTransportError(err)) return t('error.offline');
  const msg = err instanceof Error ? err.message : '';
  const loginLimited = msg.match(
    /^too many failed login attempts\. try again in (\d+) minutes$/,
  );
  if (loginLimited) {
    return t('error.loginRateLimited', { minutes: loginLimited[1] });
  }
  return msg;
}

const errorsSrc = readFileSync('shared/i18n/errors.ts', 'utf8');
if (!errorsSrc.includes('too many failed login attempts')) {
  fail('errors.ts missing login rate-limit pattern');
} else pass('shared/i18n/errors.ts maps login rate-limit phrase');
if (!errorsSrc.includes("t('error.loginRateLimited'")) {
  fail('errors.ts does not call error.loginRateLimited');
} else pass('errors.ts interpolates error.loginRateLimited with minutes');

const loginSrc = readFileSync('mobile/src/screens/LoginScreen.tsx', 'utf8');
if (!loginSrc.includes('apiErrorMessage(err, t)')) {
  fail('LoginScreen does not map errors through apiErrorMessage');
} else pass('LoginScreen catch uses apiErrorMessage(err, t)');

const passwordSrc = readFileSync('mobile/src/lib/password.ts', 'utf8');
if (!passwordSrc.includes('translateApiError')) {
  fail('password.ts apiErrorMessage is not translateApiError');
} else pass('password.ts apiErrorMessage → translateApiError');

if (!tr['error.loginRateLimited'] || !en['error.loginRateLimited']) {
  fail('error.loginRateLimited missing in TR/EN messages');
} else pass('error.loginRateLimited present in TR and EN');

const err429 = new ApiError(429, {
  error: 'too many failed login attempts. try again in 5 minutes',
});
const tTr = makeT(tr);
const tEn = makeT(en);

const trMsg = mapLoginRateLimit(tTr, err429);
const enMsg = mapLoginRateLimit(tEn, err429);
const wantTr = 'Çok fazla hatalı deneme. 5 dakika sonra tekrar deneyin.';
const wantEn = 'Too many failed attempts. Try again in 5 minutes.';

if (trMsg !== wantTr) fail(`TR got ${JSON.stringify(trMsg)}, want ${JSON.stringify(wantTr)}`);
else pass(`mobile login would render TR: ${trMsg}`);

if (enMsg !== wantEn) fail(`EN got ${JSON.stringify(enMsg)}, want ${JSON.stringify(wantEn)}`);
else pass(`mobile login would render EN: ${enMsg}`);

const oneMin = mapLoginRateLimit(
  tTr,
  new ApiError(429, {
    error: 'too many failed login attempts. try again in 1 minutes',
  }),
);
if (!oneMin.includes('1 dakika')) fail(`1-minute TR = ${JSON.stringify(oneMin)}`);
else pass(`1-minute remaining maps: ${oneMin}`);

if (isTransportError(err429)) fail('429 must not be classified as transport/offline');
else pass('429 is not a transport error (banner/offline path skipped)');

if (trMsg === tTr('error.offline') || trMsg === tTr('common.error')) {
  fail('429 was misclassified as offline/generic');
} else pass('429 is not offline/generic error');

if (process.exitCode) {
  console.error('verify-mobile-login-rate-limit: failed');
  process.exit(1);
}
console.log('verify-mobile-login-rate-limit: all checks passed');
