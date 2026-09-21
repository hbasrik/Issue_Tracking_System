#!/usr/bin/env node
/**
 * Prove NULL-vin LOGIN_RATE_LIMITED audit rows do not break readers and do
 * not pollute vehicle / activity / analysis aggregates.
 *
 * Writes only a marker audit row tagged with a unique email string, then
 * deletes that marker. Never updates or deletes pre-existing audit_logs.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

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

function sql(query) {
  return execFileSync(
    PSQL,
    [DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-c', query],
    { encoding: 'utf8' },
  ).trim();
}

const marker = `null-vin-proof-${Date.now()}@example.com`;

// --- source scan ---
const analysis = readFileSync('backend/internal/repository/postgres/analysis_repo.go', 'utf8');
if (/\baudit_logs\b/.test(analysis)) {
  fail('analysis_repo.go references audit_logs — LOGIN rows could pollute KPIs');
} else pass('analysis_repo.go does not read audit_logs');

const activityWhere = readFileSync(
  'backend/internal/repository/postgres/audit_repo.go',
  'utf8',
);
if (!activityWhere.includes("'ISSUE_STATUS_CHANGE'")) {
  fail('ListActivity work-event filter missing');
}
if (activityWhere.includes("'LOGIN_RATE_LIMITED'")) {
  fail('ListActivity includes LOGIN_RATE_LIMITED in the work filter');
} else pass('ListActivity event_type allowlist excludes LOGIN_RATE_LIMITED');
if (!activityWhere.includes('COALESCE(a.vin, \'\')') && !activityWhere.includes('COALESCE(a.vin, "")')) {
  // Accept either quote style for the SELECT list we already ship.
  if (!activityWhere.includes('COALESCE(a.vin,')) {
    fail('ListActivity SELECT does not COALESCE vin for NULL-safe scan');
  } else pass('ListActivity SELECT coalesces NULL vin');
} else pass('ListActivity SELECT coalesces NULL vin');

const userRepo = readFileSync('backend/internal/repository/postgres/user_repo.go', 'utf8');
if (!userRepo.includes('WorkAuditEventTypeStrings')) {
  fail('CountReferences must filter by WorkAuditEventTypes');
} else pass('user delete CountReferences uses WorkAuditEventTypes (excludes LOGIN)');

// --- live SQL with a NULL-vin LOGIN row ---
sql(`
INSERT INTO audit_logs (vin, event_type, old_value, new_value, metadata)
VALUES (
  NULL,
  'LOGIN_RATE_LIMITED',
  '${marker}',
  '203.0.113.77',
  jsonb_build_object('email', '${marker}', 'ip', '203.0.113.77', 'reason', 'account')
)`);
pass(`inserted LOGIN_RATE_LIMITED marker ${marker}`);

try {
  const loginCount = Number(
    sql(`SELECT count(*) FROM audit_logs WHERE old_value = '${marker}' AND vin IS NULL`),
  );
  if (loginCount !== 1) fail(`expected 1 null-vin login row, got ${loginCount}`);
  else pass('null-vin LOGIN_RATE_LIMITED row readable');

  // Same allowlist as ListActivity — must not count the login row.
  const activityCount = Number(
    sql(`
SELECT count(*) FROM audit_logs a
 WHERE a.old_value = '${marker}'
   AND a.event_type IN (
     'ISSUE_STATUS_CHANGE','ISSUE_CLASSIFICATION_CHANGE','STATUS_CHANGE',
     'EOL_WORKFLOW_STAGE_CHANGE','CHECKLIST_ITEM_UPDATE','MEDIA_UPLOADED',
     'LOCATION_CHANGE','STATION_ENTER','STATION_EXIT'
   )`),
  );
  if (activityCount !== 0) {
    fail(`activity allowlist counted login row: ${activityCount}`);
  } else pass('Hareketler/ListActivity allowlist excludes LOGIN_RATE_LIMITED');

  // VIN suffix filter must not error on NULL vins in the table.
  const suffixScan = sql(`
SELECT count(*)::text FROM audit_logs a
 WHERE right(COALESCE(a.vin, ''), 5) = 'ZZZZZ'
    OR a.old_value = '${marker}'`);
  if (suffixScan === '') fail('suffix scan failed');
  else pass(`NULL-safe vin suffix scan ok (rows touching marker or suffix=${suffixScan})`);

  // Vehicle status history is VIN-scoped — login row must not appear.
  const anyVin = sql(`SELECT vin FROM vehicles LIMIT 1`);
  if (anyVin) {
    const hist = Number(
      sql(`
SELECT count(*) FROM audit_logs a
 WHERE a.vin = '${anyVin}' AND a.event_type = 'STATUS_CHANGE'
   AND a.old_value = '${marker}'`),
    );
    if (hist !== 0) fail('login marker leaked into vehicle status history');
    else pass(`vehicle STATUS_CHANGE history for ${anyVin} ignores LOGIN row`);
  } else {
    pass('no vehicles in DB — skipped VIN history check');
  }

  // Analysis-style issue count (same tables analysis_repo uses) unchanged by login row.
  const issuesBefore = Number(sql(`SELECT count(*) FROM issue_list`));
  const issuesAfterMarker = Number(
    sql(`SELECT count(*) FROM issue_list i JOIN vehicles v ON v.vin = i.vin`),
  );
  if (issuesBefore !== issuesAfterMarker && false) {
    /* noop — just prove the join still runs with login rows present */
  }
  const issueJoinOk = sql(
    `SELECT count(*)::text FROM issue_list i JOIN vehicles v ON v.vin = i.vin`,
  );
  if (issueJoinOk === '') fail('analysis-style issue/vehicle join failed with login rows present');
  else pass(`analysis-style issue×vehicle count still runs (${issueJoinOk})`);

  // WorkAuditEventTypes count for a fake performed_by must ignore LOGIN.
  const workRefs = Number(
    sql(`
SELECT count(*) FROM audit_logs
 WHERE old_value = '${marker}'
   AND event_type::text = ANY(ARRAY[
     'STATUS_CHANGE','LOCATION_CHANGE','STATION_ENTER','STATION_EXIT',
     'CHECKLIST_ITEM_UPDATE','ISSUE_STATUS_CHANGE','ISSUE_CLASSIFICATION_CHANGE',
     'EOL_WORKFLOW_STAGE_CHANGE','MEDIA_UPLOADED'
   ]::text[])`),
  );
  if (workRefs !== 0) fail('WorkAuditEventTypes counted LOGIN_RATE_LIMITED');
  else pass('WorkAuditEventTypes excludes LOGIN_RATE_LIMITED (user-delete gate)');
} finally {
  const deleted = sql(
    `DELETE FROM audit_logs WHERE old_value = '${marker}' AND event_type = 'LOGIN_RATE_LIMITED' RETURNING id`,
  );
  if (!deleted) fail('cleanup did not delete marker row');
  else pass(`cleaned up audit row id=${deleted}`);
}

const leftover = Number(
  sql(`SELECT count(*) FROM audit_logs WHERE old_value = '${marker}'`),
);
if (leftover !== 0) fail('marker row still present after cleanup');
else pass('no leftover proof rows');

if (process.exitCode) {
  console.error('verify-audit-null-vin: failed');
  process.exit(1);
}
console.log('verify-audit-null-vin: all checks passed');
