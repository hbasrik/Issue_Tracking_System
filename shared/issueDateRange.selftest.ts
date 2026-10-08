// node --experimental-strip-types --no-warnings shared/issueDateRange.selftest.ts
import {
  editIssueDateRange,
  isCalendarDay,
  plantToday,
  presetRange,
  readIssueDateFilter,
  resolveIssueDateRange,
  writeIssueDateFilter,
} from './issueDateRange.ts';

let failed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${ok ? '' : ` — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`);
}

// 22:30 UTC on 7 Oct is 01:30 on 8 Oct in Istanbul: "today" is the 8th.
const lateUtc = new Date('2026-10-07T22:30:00Z');
check('plant today after local midnight, UTC still the day before', plantToday(lateUtc), '2026-10-08');
check('plant today at 20:59 UTC (23:59 local)', plantToday(new Date('2026-10-08T20:59:00Z')), '2026-10-08');
check('plant today at 21:00 UTC (00:00 local next day)', plantToday(new Date('2026-10-08T21:00:00Z')), '2026-10-09');

check('Bugün', presetRange('today', lateUtc), { from: '2026-10-08', to: '2026-10-08' });
check('Son 7 gün = today and 6 days before', presetRange('7d', lateUtc), { from: '2026-10-02', to: '2026-10-08' });
check('Son 7 gün across a month boundary', presetRange('7d', new Date('2026-03-03T09:00:00Z')), { from: '2026-02-25', to: '2026-03-03' });
check('Bu ay', presetRange('month', lateUtc), { from: '2026-10-01', to: '2026-10-08' });
check('Bu ay on the 1st just after local midnight', presetRange('month', new Date('2026-09-30T21:05:00Z')), { from: '2026-10-01', to: '2026-10-01' });

check('calendar day valid', isCalendarDay('2026-02-28'), true);
check('calendar day 30 Feb rejected', isCalendarDay('2026-02-30'), false);
check('calendar day bad format rejected', isCalendarDay('08.10.2026'), false);

const p = (q: string) => new URLSearchParams(q);
check('URL preset', readIssueDateFilter(p('opened=7d')), { preset: '7d' });
check('URL preset wins over custom', readIssueDateFilter(p('opened=today&opened_from=2026-01-01')), { preset: 'today' });
check('URL custom both', readIssueDateFilter(p('opened_from=2026-10-01&opened_to=2026-10-07')), { from: '2026-10-01', to: '2026-10-07' });
check('URL start only', readIssueDateFilter(p('opened_from=2026-10-01')), { from: '2026-10-01' });
check('URL end only', readIssueDateFilter(p('opened_to=2026-10-07')), { to: '2026-10-07' });
check('URL junk ignored', readIssueDateFilter(p('opened=yesterday&opened_from=x&opened_to=2026-13-01')), {});
check('URL keeps analysis from/to untouched', readIssueDateFilter(p('from=2026-01-01&to=2026-01-31')), {});

const out = p('status=OPEN&opened_from=2026-01-01');
writeIssueDateFilter(out, { preset: 'month' });
check('write preset replaces custom, keeps other params', out.toString(), 'status=OPEN&opened=month');
writeIssueDateFilter(out, { from: '2026-10-01' });
check('write custom replaces preset', out.toString(), 'status=OPEN&opened_from=2026-10-01');
writeIssueDateFilter(out, {});
check('write empty clears', out.toString(), 'status=OPEN');

check('resolve preset at now', resolveIssueDateRange({ preset: 'today' }, lateUtc), { from: '2026-10-08', to: '2026-10-08' });
check('resolve custom', resolveIssueDateRange({ to: '2026-10-07' }, lateUtc), { to: '2026-10-07' });

check('edit from past to moves to', editIssueDateRange({ from: '2026-10-01', to: '2026-10-03' }, { from: '2026-10-05' }), { from: '2026-10-05', to: '2026-10-05' });
check('edit to before from moves from', editIssueDateRange({ from: '2026-10-05', to: '2026-10-07' }, { to: '2026-10-02' }), { from: '2026-10-02', to: '2026-10-02' });
check('edit clears one end', editIssueDateRange({ from: '2026-10-05', to: '2026-10-07' }, { from: '' }), { to: '2026-10-07' });

console.log(failed ? `FAILED: ${failed}` : 'ALL PASS');
process.exit(failed ? 1 : 0);
