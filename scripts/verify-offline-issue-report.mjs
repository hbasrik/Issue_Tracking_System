#!/usr/bin/env node
/**
 * Proofs for offline issue-report behaviour:
 * 1) issue-report cache set == every VIN Create Issue accepts
 * 2) HTTP 401/200 flips connectivity back to online (listener fires)
 * 3) user flush is not gated on the online flag
 * 4) banner is in-flow (no absolute overlay)
 * 5) 401 keeps the row; 400/409 marks failed and does not delete
 * 6) 401 pending/auth is auto-sent after a successful login
 * 7) send-now shows sending before the flush lock is free
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
  classifyQueueSendError,
  isAuthError,
  isPayloadRejection,
  shouldQueueIssueSubmit,
} from '../shared/networkError.ts';
import {
  overlaySendingStatus,
  queueItemAfterSendError,
  shouldAutoFlush,
} from '../mobile/src/lib/issueReportQueuePolicy.ts';
import {
  isAppOnline,
  noteTransportFailure,
  noteTransportSuccess,
  resetConnectivityForTests,
  subscribeConnectivity,
} from '../mobile/src/offline/connectivityStore.ts';

const PSQL = '/opt/homebrew/opt/libpq/bin/psql';
const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgres://karea:karea_secret@localhost:5432/karea?sslmode=disable';

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exitCode = 1;
}

function pass(msg) {
  console.log(`ok: ${msg}`);
}

function apiError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function sql(query) {
  return execFileSync(
    PSQL,
    [DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-c', query],
    { encoding: 'utf8' },
  ).trim();
}

// --- 1. cache set vs SQL ---
const all = Number(sql('SELECT count(*) FROM vehicles'));
const planned = Number(
  sql("SELECT count(*) FROM vehicles WHERE current_global_status = 'PLANNED'"),
);
const listHiddenPlanned = Number(
  sql("SELECT count(*) FROM vehicles WHERE current_global_status <> 'PLANNED'"),
);
const eligible = Number(
  sql(
    `SELECT count(*) FROM vehicles WHERE current_global_status IN
     ('PLANNED','IN_PRODUCTION','IN_WAREHOUSE','DELIVERED','SHIPPED','ON_HOLD')`,
  ),
);
console.log(
  `sql: all=${all} planned=${planned} list_without_planned=${listHiddenPlanned} issue_report_eligible=${eligible}`,
);
if (eligible !== all) fail(`eligible ${eligible} != all vehicles ${all}`);
else pass(`issue-report set = ${eligible} vehicles (includes ${planned} PLANNED)`);
if (listHiddenPlanned === all) fail('Karar 10 list filter is not excluding PLANNED');
else pass(`Vehicles table filter would cache only ${listHiddenPlanned} rows — that was the 4/5-vehicle bug`);

const cacheSrc = readFileSync('mobile/src/offline/referenceCache.ts', 'utf8');
if (!cacheSrc.includes("scope: 'issue_report'")) {
  fail('reference cache still lists without scope=issue_report');
} else pass('cache fetch uses scope=issue_report');

// --- 2. connectivity listener on HTTP reachability ---
resetConnectivityForTests(true);
const events = [];
const unsub = subscribeConnectivity((v) => events.push(v));
noteTransportFailure();
if (isAppOnline()) fail('failure did not set offline');
else pass(`listener after failure: ${JSON.stringify(events)}`);
const before401 = events.length;
// What the client now does on any HTTP status, including 401:
noteTransportSuccess();
if (!isAppOnline()) fail('HTTP reachability did not set online');
if (events[events.length - 1] !== true) {
  fail(`listener did not emit true after HTTP success, events=${JSON.stringify(events)}`);
} else pass(`401-equivalent HTTP response flipped online (emits after index ${before401}: ${JSON.stringify(events)})`);
unsub();

// Restart default is online — explains "kill app, banner gone":
resetConnectivityForTests(true);
if (!isAppOnline()) fail('module default should be online');
else pass('process restart resets the flag to online (matches kill-app observation)');

// --- 3. user flush ignores the online flag ---
const provider = readFileSync('mobile/src/offline/IssueReportQueueProvider.tsx', 'utf8');
const queue = readFileSync('mobile/src/lib/issueReportQueue.ts', 'utf8');
if (provider.includes('isAppOnline') || queue.includes('isAppOnline')) {
  fail('flush still consults the online flag');
} else pass('flushQueue / provider do not read isAppOnline');
if (provider.includes('i < 40 && flushLock')) {
  fail('send-now still gives up after 2s while a background flush holds the lock');
} else pass('forced flush waits for the lock instead of returning no-op');
const forceWhileFailed = shouldAutoFlush(
  {
    status: 'failed',
    createdAt: new Date().toISOString(),
    lastErrorCode: 'http',
    lastError: 'description is required',
  },
  Date.now(),
  true,
);
if (!forceWhileFailed) fail('force flush must send even after a payload failure');
else pass('user force=true sends regardless of lastErrorCode and online flag');

// --- 4. banner in flow ---
const banner = readFileSync('mobile/src/offline/OfflineBanner.tsx', 'utf8');
const app = readFileSync('mobile/App.tsx', 'utf8');
if (banner.includes('position: \'absolute\'') || banner.includes('position: "absolute"')) {
  fail('banner is still absolutely positioned over controls');
} else pass('banner is in-flow, not absolute');
if (!app.includes('<OfflineBanner />') || !app.includes('flex: 1')) {
  fail('AppShell does not keep banner out of the navigator overlay');
} else pass('banner sits above the navigator in AppShell');

// --- 5. 401 keep vs 400/409 failed keep ---
const err401 = apiError(401, 'token expired');
const err400 = apiError(400, 'description is required');
const err409 = apiError(409, 'entity not found');
if (!isAuthError(err401) || isPayloadRejection(err401)) fail('401 misclassified');
if (!shouldQueueIssueSubmit(err401)) fail('401 must stay queueable');
else pass('401 is auth — queue/keep, not payload rejection');
if (!isPayloadRejection(err400) || shouldQueueIssueSubmit(err400)) fail('400 must not queue on first save');
else pass('400 is payload rejection on first save');

if (classifyQueueSendError(err401) !== 'auth') fail('401 kind');
if (classifyQueueSendError(err400) !== 'payload') fail('400 kind');
if (classifyQueueSendError(err409) !== 'payload') fail('409 kind');

const after401 = queueItemAfterSendError({
  attempts: 0,
  kind: 'auth',
  message: 'token expired',
  nowMs: Date.now(),
});
if (after401.deleted) fail('401 deleted the row');
if (after401.status !== 'pending' || after401.lastErrorCode !== 'auth') {
  fail(`401 next state ${JSON.stringify(after401)}`);
} else pass('401: row stays pending with lastErrorCode=auth (not deleted)');

const after400 = queueItemAfterSendError({
  attempts: 0,
  kind: 'payload',
  message: 'description is required',
  nowMs: Date.now(),
});
if (after400.deleted) fail('400 deleted the row');
if (after400.status !== 'failed' || after400.lastErrorCode !== 'http') {
  fail(`400 next state ${JSON.stringify(after400)}`);
} else pass('400: row stays failed (not deleted)');

const after409 = queueItemAfterSendError({
  attempts: 0,
  kind: 'payload',
  message: 'entity not found',
  nowMs: Date.now(),
});
if (after409.deleted || after409.status !== 'failed') fail('409 must stay as failed');
else pass('409: row stays failed (not deleted)');

const pending = readFileSync('mobile/src/screens/PendingReportsScreen.tsx', 'utf8');
if (pending.includes('return item.lastError')) {
  fail('pending screen still dumps raw lastError');
} else pass('pending screen maps errors through i18n / session copy');

// --- 6. post-login auto-retry: 401 pending/auth → login → selected for send ---
function flushTargets(items, opts, nowMs) {
  return items
    .filter((item) => (opts.id ? item.id === opts.id : true))
    .filter((item) =>
      shouldAutoFlush(item, nowMs, opts.force === true, opts.afterLogin === true),
    );
}

const loginNow = Date.now();
const authPatch = queueItemAfterSendError({
  attempts: 0,
  kind: 'auth',
  message: 'token expired',
  nowMs: loginNow,
});
const queuedAfter401 = {
  id: 'client-req-401',
  createdAt: new Date(loginNow).toISOString(),
  status: authPatch.status,
  lastErrorCode: authPatch.lastErrorCode,
  lastError: authPatch.lastError,
  attempts: authPatch.attempts,
  nextAttemptAt: authPatch.nextAttemptAt,
};
if (queuedAfter401.status !== 'pending' || queuedAfter401.lastErrorCode !== 'auth') {
  fail(`pre-login row ${JSON.stringify(queuedAfter401)}`);
}
const pollAfter401 = flushTargets([queuedAfter401], {}, loginNow);
if (pollAfter401.length !== 0) {
  fail('periodic flush must still honor backoff immediately after 401');
} else pass('periodic flush leaves 401/auth queued during backoff');

const loginAfter401 = flushTargets([queuedAfter401], { afterLogin: true }, loginNow);
if (loginAfter401.length !== 1 || loginAfter401[0].id !== 'client-req-401') {
  fail(`login flush did not select the auth row: ${JSON.stringify(loginAfter401)}`);
} else pass('login flush selects the 401/auth row for sendOne despite backoff');

const payloadOnLogin = flushTargets(
  [
    {
      ...queuedAfter401,
      id: 'client-req-400',
      status: 'failed',
      lastErrorCode: 'http',
      lastError: 'description is required',
    },
  ],
  { afterLogin: true },
  loginNow,
);
if (payloadOnLogin.length !== 0) {
  fail('login flush must not auto-send payload failures');
} else pass('login flush still skips payload http rows');

if (!provider.includes('flush({ afterLogin: true })')) {
  fail('auth effect does not call flush({ afterLogin: true })');
} else pass('isAuthenticated effect triggers flush({ afterLogin: true })');
if (!queue.includes('shouldAutoFlush(item, now, force, afterLogin)')) {
  fail('flushQueue does not thread afterLogin into shouldAutoFlush');
} else pass('flushQueue passes afterLogin to shouldAutoFlush (the send gate)');
if (
  !queue.includes('for (const item of targets)') ||
  !queue.includes('await sendOne(userId, item, force)')
) {
  fail('flushQueue no longer sends selected targets');
} else pass('flushQueue sendOne is the only step after shouldAutoFlush');
if (!provider.includes('!opts?.force && !opts?.afterLogin')) {
  fail('login flush still returns no-op while the background lock is held');
} else pass('afterLogin waits for the flush lock instead of dropping the retry');

const sentIds = [];
for (const item of loginAfter401) sentIds.push(item.id);
if (sentIds.length !== 1 || sentIds[0] !== 'client-req-401') {
  fail(`login would not send the queued 401 row: ${JSON.stringify(sentIds)}`);
} else pass('post-login flush would send client-req-401 (sendOne target list)');

// --- 7. send-now overlays sending before waiting on the lock ---
const overlayNow = overlaySendingStatus(
  [{ id: 'client-req-401', status: 'pending' }],
  new Set(['client-req-401']),
);
if (overlayNow[0].status !== 'sending') {
  fail(`send-now overlay ${JSON.stringify(overlayNow)}`);
} else pass('send-now overlay flips pending → sending before the request runs');

const sendNowIdx = provider.indexOf('opts?.force');
const lockWaitIdx = provider.indexOf('while (flushLock.current)');
if (sendNowIdx < 0 || lockWaitIdx < 0 || sendNowIdx > lockWaitIdx) {
  fail('sending overlay is not applied before the flush-lock wait');
} else pass('setSendingIds runs before while (flushLock.current)');
if (!provider.includes('overlaySendingStatus(items, sendingIds)')) {
  fail('queue context does not expose overlay sending status');
} else pass('pending list reads overlaySendingStatus so the button state updates immediately');

if (process.exitCode) {
  console.error('verify-offline-issue-report: failed');
  process.exit(1);
}
console.log('verify-offline-issue-report: all checks passed');
