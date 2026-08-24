import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, type Issue } from '../lib/api';
import { IssueList } from '../components/IssueList';
import { issueMatchesListQuery } from '../lib/issueVinFilter';
import {
  HOME_ISSUE_STAT_LABELS,
  isHomeIssueStatKey,
  matchesHomeIssueStat,
} from '../lib/homeIssueStats';
import { brandColors } from '../theme/tokens';
import {
  SeverityIndicator,
  severityFillColor,
  type SeverityLevel,
} from '../components/SeverityIndicator';

type IssueStatus = Issue['Status'];

const SEVERITIES: SeverityLevel[] = ['CRITICAL', 'MEDIUM', 'LOW'];

const STATUSES: { value: IssueStatus; label: string }[] = [
  { value: 'OPEN', label: 'Açık' },
  { value: 'IN_PROGRESS', label: 'İşlemde' },
  { value: 'DONE', label: 'Tamamlandı' },
  { value: 'CONDITIONAL_APPROVED', label: 'Şartlı Onay' },
  { value: 'APPROVED', label: 'Kalite Onay' },
];

/** Issues list + detail — quality approval and Şartlı Onay are Manager-only. */
export default function IssuesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const homeStatParam = searchParams.get('homeStat');
  const homeStat = isHomeIssueStatKey(homeStatParam) ? homeStatParam : null;

  const [listQuery, setListQuery] = useState('');
  const [severities, setSeverities] = useState<Set<SeverityLevel>>(new Set());
  const [statuses, setStatuses] = useState<Set<string>>(new Set());
  const [items, setItems] = useState<Issue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [homeStatNow] = useState(() => new Date());

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api.listIssues();
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
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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

  function toggleSeverity(s: SeverityLevel) {
    if (homeStat) clearHomeStat();
    setSeverities((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  function toggleStatus(s: string) {
    if (homeStat) clearHomeStat();
    setStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  const visible = useMemo(
    () =>
      items.filter((issue) => {
        if (homeStat) {
          return matchesHomeIssueStat(issue, homeStat, homeStatNow);
        }
        if (!issueMatchesListQuery(issue, listQuery)) {
          return false;
        }
        if (severities.size > 0 && !severities.has(issue.Severity as SeverityLevel)) {
          return false;
        }
        if (statuses.size > 0 && !statuses.has(issue.Status)) {
          return false;
        }
        return true;
      }),
    [items, listQuery, homeStat, homeStatNow, severities, statuses],
  );

  return (
    <section>
      <h1 className="text-xl font-semibold sm:text-2xl">Issues</h1>
      <p
        className="mt-1 text-[13px]"
        style={{ color: 'var(--brand-neutral-gray)' }}
      >
        Global issue queue — quality approval (Tamamlandı → Kalite Onay or Şartlı Onay)
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

      <div className="mt-6 space-y-4">
        <div className="w-full sm:max-w-sm">
          <label
            className="text-[13px]"
            style={{ color: 'var(--brand-neutral-gray)' }}
          >
            VIN / bildiren
          </label>
          <input
            type="search"
            value={listQuery}
            onChange={(e) => {
              if (homeStat) clearHomeStat();
              setListQuery(e.target.value);
            }}
            placeholder="VIN veya bildiren adı"
            aria-label="VIN veya bildiren adı"
            className="mt-1 w-full rounded-lg border bg-[var(--bg-surface-1)] px-3 py-2 text-[15px] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] outline-none focus:border-[var(--accent)]"
            style={{ borderColor: 'var(--border)' }}
          />
        </div>

        <div>
          <p
            className="mb-2 text-[13px] font-semibold"
            style={{ color: 'var(--brand-neutral-gray)' }}
          >
            Severity
          </p>
          <div className="flex gap-2">
            {SEVERITIES.map((s) => {
              const selected = !homeStat && severities.has(s);
              const color = severityFillColor(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleSeverity(s)}
                  className="flex min-h-touch flex-1 flex-col items-center justify-center gap-1 rounded-[10px] border px-2 py-1.5"
                  style={{
                    borderColor: selected ? color : 'var(--border)',
                    borderWidth: selected ? 1.5 : 1,
                    backgroundColor: selected
                      ? `color-mix(in srgb, ${color} 20%, transparent)`
                      : 'var(--bg-surface-1)',
                  }}
                >
                  <SeverityIndicator severity={s} />
                  <span
                    className="text-[10px] font-semibold"
                    style={{ color: selected ? color : 'var(--brand-neutral-gray)' }}
                  >
                    {s}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p
            className="mb-2 text-[13px] font-semibold"
            style={{ color: 'var(--brand-neutral-gray)' }}
          >
            Durum
          </p>
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((s) => {
              const selected = !homeStat && statuses.has(s.value);
              return (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => toggleStatus(s.value)}
                  className="min-h-[36px] rounded-full border px-3 text-[12px] font-semibold"
                  style={{
                    borderColor: selected ? 'var(--accent)' : 'var(--border)',
                    backgroundColor: selected
                      ? 'var(--bg-surface-2)'
                      : 'var(--bg-surface-1)',
                    color: selected
                      ? 'var(--accent)'
                      : 'var(--brand-neutral-gray)',
                  }}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
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
