import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, type Issue, type Vehicle } from '../lib/api';
import { IssueList } from '../components/IssueList';
import { VinSearchBox } from '../components/VinSearchBox';
import { issueMatchesVinQuery } from '../lib/issueVinFilter';
import {
  HOME_ISSUE_STAT_LABELS,
  isHomeIssueStatKey,
  matchesHomeIssueStat,
} from '../lib/homeIssueStats';
import { brandColors } from '../theme/tokens';

/** Issues list + detail — quality approval and Şartlı Onay are Manager-only. */
export default function IssuesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const homeStatParam = searchParams.get('homeStat');
  const homeStat = isHomeIssueStatKey(homeStatParam) ? homeStatParam : null;

  const [statusFilter, setStatusFilter] = useState('');
  const [vinQuery, setVinQuery] = useState('');
  const [matchedVehicles, setMatchedVehicles] = useState<Vehicle[]>([]);
  const [items, setItems] = useState<Issue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [homeStatNow] = useState(() => new Date());

  const load = useCallback(async () => {
    setError(null);
    try {
      const status = homeStat ? undefined : statusFilter || undefined;
      const res = await api.listIssues(status);
      const list = (res.items ?? []).slice().sort((a, b) => {
        const ta = Date.parse(a.CreatedAt || a.IssueDate || '') || 0;
        const tb = Date.parse(b.CreatedAt || b.IssueDate || '') || 0;
        if (tb !== ta) return tb - ta;
        return b.ID - a.ID;
      });
      setItems(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load issues');
      setItems([]);
    }
  }, [statusFilter, homeStat]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(
    () =>
      items.filter((issue) => {
        if (homeStat && !matchesHomeIssueStat(issue, homeStat, homeStatNow)) {
          return false;
        }
        return issueMatchesVinQuery(issue, vinQuery, matchedVehicles);
      }),
    [items, vinQuery, matchedVehicles, homeStat, homeStatNow],
  );

  function clearHomeStat() {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('homeStat');
        return next;
      },
      { replace: true },
    );
  }

  return (
    <section>
      <h1 className="text-xl font-semibold sm:text-2xl">Issues</h1>
      <p
        className="mt-1 text-[13px]"
        style={{ color: 'var(--brand-neutral-gray)' }}
      >
        Global issue queue — quality approval (DONE → APPROVED or Şartlı Onay)
        is Manager-only
      </p>

      {homeStat && (
        <div
          className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-[var(--bg-surface-1)] px-4 py-3"
          style={{ borderColor: 'var(--border)' }}
        >
          <p className="text-[13px] text-[var(--text-primary)]">
            Home filtre: {HOME_ISSUE_STAT_LABELS[homeStat]} · {visible.length}{' '}
            kayıt
          </p>
          <button
            type="button"
            onClick={clearHomeStat}
            className="min-h-touch rounded-lg border px-3 py-1.5 text-[13px]"
            style={{
              borderColor: 'var(--border)',
              color: brandColors.secondary,
            }}
          >
            Temizle
          </button>
        </div>
      )}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="w-full sm:max-w-sm">
          <label
            className="text-[13px]"
            style={{ color: 'var(--brand-neutral-gray)' }}
          >
            VIN / araç no
          </label>
          <VinSearchBox
            value={vinQuery}
            onChange={(q) => {
              setVinQuery(q);
              if (q.trim().length < 2) setMatchedVehicles([]);
            }}
            onResults={setMatchedVehicles}
            resultTo={(v) => `/vehicles/${v.VIN}?tab=issues`}
            className="mt-1"
          />
        </div>
        <div className="w-full sm:w-auto">
          <label
            className="text-[13px]"
            style={{ color: 'var(--brand-neutral-gray)' }}
          >
            Status
          </label>
          <select
            value={homeStat ? '' : statusFilter}
            disabled={Boolean(homeStat)}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="mt-1 min-h-touch w-full rounded-lg border bg-[var(--bg-surface-1)] px-3 py-2 text-[15px] sm:w-auto disabled:opacity-60"
            style={{ borderColor: 'var(--border)' }}
          >
            <option value="">All statuses</option>
            <option value="OPEN">OPEN</option>
            <option value="IN_PROGRESS">IN_PROGRESS</option>
            <option value="DONE">DONE</option>
            <option value="APPROVED">APPROVED</option>
            <option value="CONDITIONAL_APPROVED">CONDITIONAL_APPROVED</option>
          </select>
        </div>
      </div>

      {error && (
        <p className="mt-3 text-[13px]" style={{ color: 'var(--status-not-ok)' }}>
          {error}
        </p>
      )}

      <div className="mt-4">
        <IssueList items={visible} onStatusChanged={() => void load()} />
      </div>
    </section>
  );
}
