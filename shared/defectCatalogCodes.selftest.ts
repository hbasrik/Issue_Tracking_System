/**
 * Run: node --experimental-strip-types shared/defectCatalogCodes.selftest.ts
 */
import assert from 'node:assert/strict';
import {
  isValidPartCode,
  isValidTypeCode,
  nextPartCode,
  nextTypeCode,
  sameCatalogueName,
} from './defectCatalogCodes.ts';
import { catalogRejection } from './queueCatalogRejection.ts';

const body = ['10-01', '10-02', '10-03', '20-01', '99-99'];
assert.equal(nextPartCode('10', body), '10-04');
assert.equal(nextPartCode('20', body), '20-02');
assert.equal(nextPartCode('30', body), '30-01');
assert.equal(nextPartCode('10', ['10-01', '10-05', 'ZZZ', '40-77']), '10-06');
assert.equal(nextPartCode('10', ['10-98', '10-99']), '10-01', 'falls back to the first gap');
assert.equal(nextPartCode('', body), null);

assert.equal(nextTypeCode(['01', '02', '09', '99']), '10');
assert.equal(nextTypeCode(['99']), '01');
assert.equal(nextTypeCode([]), '01');

assert.ok(isValidPartCode('10', '10-04'));
assert.ok(isValidPartCode('10', ' 10-04 '));
for (const bad of ['40-77', 'ZZZ', '10-4', '10-004', '10-00', '10-AB', '']) {
  assert.ok(!isValidPartCode('10', bad), `part ${bad}`);
}
assert.ok(isValidTypeCode('07'));
for (const bad of ['7', '007', 'AB', '00', '10-01']) {
  assert.ok(!isValidTypeCode(bad), `type ${bad}`);
}

assert.ok(sameCatalogueName('Test Kapı Kolu', 'test kapı kolu '));
assert.ok(sameCatalogueName('KAPI KOLU', 'kapı kolu'));
assert.ok(sameCatalogueName('İç  trim', 'iç trim'));
assert.ok(sameCatalogueName('DOOR HINGE', 'door hinge'));
assert.ok(!sameCatalogueName('Kapı kolu', 'Kapı paneli'));

const catalog = { loaded: true, partIds: new Set([10, 11]), typeIds: new Set([1, 2]) };
const item = (part: number, type: number, extra: Record<string, unknown> = {}) => ({
  status: 'failed',
  payload: { defect_part_id: part, defect_type_id: type },
  ...extra,
});
assert.equal(catalogRejection(item(10, 1), catalog), null);
assert.equal(catalogRejection(item(12, 1), catalog), 'part');
assert.equal(catalogRejection(item(10, 3), catalog), 'type');
assert.equal(catalogRejection(item(12, 3), catalog), 'both');
assert.equal(catalogRejection(item(12, 1, { issueId: 5 }), catalog), null, 'issue already created');
assert.equal(catalogRejection(item(12, 1, { status: 'sending' }), catalog), null);
assert.equal(
  catalogRejection(item(10, 1, { lastErrorCode: 'http', lastError: 'selected catalogue item is inactive' }), catalog),
  'unknown',
  'server rejected while the cache still lists both',
);
assert.equal(
  catalogRejection(item(10, 1, { lastErrorCode: 'http', lastError: "selected part's zone is inactive" }), catalog),
  'part',
);
assert.equal(
  catalogRejection(item(10, 1, { lastErrorCode: 'http', lastError: 'vin is required' }), catalog),
  null,
);
assert.equal(
  catalogRejection(item(12, 3), { loaded: false, partIds: new Set(), typeIds: new Set() }),
  null,
  'no snapshot yet',
);

console.log('defectCatalogCodes selftest: ok');
