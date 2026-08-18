import { useEffect, useState } from 'react';
import {
  api,
  type DailyPendingIssue,
  type Issue,
  type StationDefectRate,
  type StationMTTR,
} from '../lib/api';
import { IssueList } from '../components/IssueList';

function isAttentionIssue(issue: Issue): boolean {
  const open = issue.Status === 'OPEN' || issue.Status === 'IN_PROGRESS';
  return open && issue.Severity === 'CRITICAL';
}

/** Home / Overview — §4.2: KPI strip + attention-needed issue cards. */
export default function HomePage() {
  const [pending, setPending] = useState<DailyPendingIssue[]>([]);
  const [mttr, setMttr] = useState<StationMTTR[]>([]);
  const [defects, setDefects] = useState<StationDefectRate[]>([]);
  const [attention, setAttention] = useState<Issue[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [p, m, d, issues] = await Promise.all([
          api.dailyPendingIssues({}),
          api.mttr({}),
          api.defectRatePerStation({}),
          api.listIssues(),
        ]);
        if (cancelled) return;
        setPending(p.items ?? []);
        setMttr(m.items ?? []);
        setDefects(d.items ?? []);
        setAttention((issues.items ?? []).filter(isAttentionIssue));
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load KPIs');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const latestPending =
    pending.length > 0 ? pending[pending.length - 1].PendingCount : 0;
  const avgMttrHours =
    mttr.length > 0
      ? mttr.reduce((sum, r) => sum + nsToHours(r.MeanTimeToResolve), 0) /
        mttr.length
      : 0;
  const totalDefects = defects.reduce((sum, r) => sum + r.IssueCount, 0);

  return (
    <section>
      <h1 className="text-xl font-semibold sm:text-2xl">Home / Overview</h1>
      <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
        KPI summary and issues needing attention
      </p>

      {error && (
        <p className="mt-4 text-[13px]" style={{ color: 'var(--status-not-ok)' }}>
          {error}
        </p>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Daily Pending Issues" value={String(latestPending)} />
        <KpiCard title="Completed Today" value="—" hint="from completed-issues view" />
        <KpiCard
          title="Avg MTTR"
          value={avgMttrHours > 0 ? `${avgMttrHours.toFixed(1)} h` : '—'}
        />
        <KpiCard title="Defect Rate" value={String(totalDefects)} hint="total issues across stations" />
      </div>

      <div className="mt-8">
        <h2 className="text-lg font-semibold">Dikkat Edilmesi Gerekenler</h2>
        <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
          Open critical issues — click a card to open its detail
        </p>
        <div className="mt-4">
          <IssueList
            items={attention}
            emptyLabel="No critical open issues"
            onStatusChanged={() => {
              void api.listIssues().then((res) => {
                setAttention((res.items ?? []).filter(isAttentionIssue));
              });
            }}
          />
        </div>
      </div>
    </section>
  );
}

function KpiCard({
  title,
  value,
  hint,
}: {
  title: string;
  value: string;
  hint?: string;
}) {
  return (
    <div
      className="rounded-xl border bg-[var(--bg-surface-1)] p-5"
      style={{ borderColor: 'var(--border)' }}
    >
      <p className="text-[13px] text-[var(--text-secondary)]">{title}</p>
      <p className="mt-2 text-3xl font-semibold text-[var(--text-primary)]">
        {value}
      </p>
      {hint && (
        <p className="mt-1 text-[12px] text-[var(--text-secondary)]">{hint}</p>
      )}
    </div>
  );
}

function nsToHours(ns: number): number {
  return ns / 1e9 / 3600;
}
