#!/usr/bin/env node
/**
 * Force the same transport-vs-rejection split the mobile client uses
 * (ApiError status 0 / TypeError "fetch failed" vs HTTP 4xx) and prove:
 *   - save → queue, no raw "fetch failed" copy
 *   - 400 stays a visible rejection and is not queued
 *   - VIN typeahead works against a cached 500-vehicle list
 */
import {
  isClientRejection,
  isTransportError,
  shouldQueueIssueSubmit,
} from '../shared/networkError.ts';
import { searchCachedVin } from '../shared/searchCachedVin.ts';

const QUEUED = 'Kaydedildi. Bağlantı gelince otomatik gönderilecek.';
const OFFLINE = 'Çevrimdışısınız. Bağlantı gelince tekrar deneyin.';
const DESC_REQUIRED = 'Açıklama gerekli.';

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

/** Mirrors submitOrQueueIssueReport + screen copy (no RN). */
function simulateSave(err) {
  if (shouldQueueIssueSubmit(err)) {
    return { kind: 'queued', shown: QUEUED };
  }
  const shown = isTransportError(err)
    ? OFFLINE
    : err.message === 'description is required'
      ? DESC_REQUIRED
      : err.message;
  return { kind: 'rejected', shown };
}

const fetchFailed = new TypeError('fetch failed');
if (!isTransportError(fetchFailed)) fail('TypeError fetch failed should be transport');
else pass('TypeError fetch failed is transport');

const wrapped = apiError(0, 'network unavailable');
if (!isTransportError(wrapped) || !shouldQueueIssueSubmit(wrapped)) {
  fail('status 0 should queue');
} else pass('status 0 queues');

const queued = simulateSave(fetchFailed);
if (queued.kind !== 'queued') fail('fetch failed should queue, not reject');
if (String(queued.shown).toLowerCase().includes('fetch')) {
  fail(`raw fetch leaked: ${queued.shown}`);
} else pass(`queued copy: ${queued.shown}`);

const timeout = Object.assign(new Error('aborted'), { name: 'AbortError' });
const queuedTimeout = simulateSave(timeout);
if (queuedTimeout.kind !== 'queued') fail('timeout should queue');
else pass('timeout queues');

const bad400 = apiError(400, 'description is required');
if (!isClientRejection(bad400) || shouldQueueIssueSubmit(bad400)) {
  fail('400 must not queue');
} else pass('400 is a client rejection, not queued');

const shown400 = simulateSave(bad400);
if (shown400.kind !== 'rejected') fail('400 should reject');
if (String(shown400.shown).toLowerCase().includes('fetch')) {
  fail('400 shown fetch leaked');
} else pass(`400 shown: ${shown400.shown}`);

const unauthorized = apiError(401, 'invalid token');
if (shouldQueueIssueSubmit(unauthorized)) fail('401 must not queue');
else pass('401 not queued');

const server = apiError(503, 'service unavailable');
if (!shouldQueueIssueSubmit(server)) fail('503 should queue');
else pass('503 queues as transient');

if (isTransportError(fetchFailed) && OFFLINE.toLowerCase().includes('fetch')) {
  fail('offline copy contains fetch');
} else pass(`transport UI copy: ${OFFLINE}`);

const vehicles = Array.from({ length: 500 }, (_, i) => ({
  VIN: `WVWZZZ3CZWE${String(100000 + i).slice(-6)}`,
  VehicleModelID: 1,
  CurrentGlobalStatus: 'IN_PRODUCTION',
  CurrentEOLStage: 'BRANCH',
  StatusBeforeHold: null,
  HoldReason: null,
  CurrentStationID: (i % 8) + 1,
  TotalProgressPercentage: i % 100,
  EOLTemplateID: 1,
  ShipmentTemplateID: 1,
  TestTemplateID: 1,
  CreatedAt: '2026-01-15T08:00:00Z',
  UpdatedAt: '2026-09-17T08:00:00Z',
}));
const catalog = {
  fetchedAt: '2026-09-17T08:00:00Z',
  vehicles,
  zones: Array.from({ length: 20 }, (_, i) => ({
    ID: i + 1,
    Code: `Z${i}`,
    NameTR: `Bolge ${i}`,
    NameEN: `Zone ${i}`,
  })),
  parts: Array.from({ length: 80 }, (_, i) => ({
    ID: i + 1,
    ZoneID: (i % 20) + 1,
    Code: `P${i}`,
    NameTR: `Parca ${i}`,
    NameEN: `Part ${i}`,
  })),
  types: Array.from({ length: 30 }, (_, i) => ({
    ID: i + 1,
    Code: `T${i}`,
    NameTR: `Kusur ${i}`,
    NameEN: `Type ${i}`,
  })),
  stations: Array.from({ length: 8 }, (_, i) => ({
    ID: i + 1,
    Name: `Istasyon ${i + 1}`,
    SequenceNo: i + 1,
  })),
  issueTypes: [
    { ID: 1, Name: 'Uretim' },
    { ID: 2, Name: 'Test' },
  ],
};
const jsonBytes = Buffer.byteLength(JSON.stringify(catalog), 'utf8');
const kb = Math.round(jsonBytes / 1024);
if (jsonBytes > 2_000_000) fail(`500 vehicles too large: ${kb} KB`);
else pass(`500-vehicle JSON is ${kb} KB (under 2 MB)`);

const hits = searchCachedVin(vehicles, '100042');
if (hits.length < 1 || !hits[0].VIN.endsWith('100042')) {
  fail(`cache VIN search missed: ${JSON.stringify(hits.slice(0, 3))}`);
} else pass(`cache VIN search found ${hits[0].VIN}`);

const empty = searchCachedVin(vehicles, 'x');
if (empty.length !== 0) fail('short query must not search');
else pass('short query returns no rows');

if (process.exitCode) {
  console.error('verify-offline-issue-report: failed');
  process.exit(1);
}
console.log('verify-offline-issue-report: all checks passed');
