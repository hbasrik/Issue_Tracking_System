#!/usr/bin/env node
/**
 * Runs the Go tests that prove B7 local observability (panic recovery,
 * rotating file sink, 5xx + request_id, password redaction).
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

function run(args) {
  return execFileSync('go', args, {
    cwd: join(process.cwd(), 'backend'),
    encoding: 'utf8',
    env: process.env,
  });
}

const suites = [
  ['./internal/delivery/http/', '-run', 'TestRecoverPanic_Returns500KeepsProcess|TestLogin_PasswordNotLogged|TestUnhandledError_5xxIncludesRequestID|TestPanicProbe_ProductionConfig_NotFound|TestPanicProbe_RequiresAuth', '-count=1', '-v'],
  ['./internal/platform/applog/', '-count=1', '-v'],
];

for (const args of suites) {
  const out = run(['test', ...args]);
  process.stdout.write(out);
  if (!out.includes('PASS') && !out.includes('ok')) {
    console.error('FAIL: ' + args.join(' '));
    process.exit(1);
  }
}

console.log('verify-b7-observability: all checks passed');
