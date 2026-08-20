import { useEffect, useState } from 'react';
import { api, type IssueStatusHistoryEntry } from '../lib/api';

function formatEventAt(iso: string): string {
  if (!iso || iso.startsWith('0001')) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('tr-TR');
}

function statusLabel(status: string): string {
  switch (status) {
    case 'OPEN':
      return 'OPEN';
    case 'IN_PROGRESS':
      return 'IN_PROGRESS';
    case 'DONE':
      return 'DONE';
    case 'APPROVED':
      return 'APPROVED';
    case 'CONDITIONAL_APPROVED':
      return 'CONDITIONAL_APPROVED';
    default:
      return status || '—';
  }
}

/** Chronological ISSUE_STATUS_CHANGE trail from GET /issues/:id/history. */
export function IssueStatusHistory({ issueId }: { issueId: number }) {
  const [items, setItems] = useState<IssueStatusHistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    api
      .getIssueHistory(issueId)
      .then((res) => {
        if (!cancelled) setItems(res.items ?? []);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'geçmiş yüklenemedi');
          setItems([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [issueId]);

  return (
    <div>
      <h3 className="text-[15px] font-semibold">Durum Geçmişi</h3>
      {error && (
        <p className="mt-2 text-[13px]" style={{ color: 'var(--status-not-ok)' }}>
          {error}
        </p>
      )}
      {!error && items.length === 0 && (
        <p
          className="mt-2 text-[13px]"
          style={{ color: 'var(--brand-neutral-gray)' }}
        >
          Henüz durum değişikliği yok
        </p>
      )}
      {items.length > 0 && (
        <ol className="mt-2 space-y-2">
          {items.map((row) => (
            <li
              key={row.ID}
              className="rounded-lg border bg-[var(--bg-surface-2)] px-3 py-2 text-[13px]"
              style={{ borderColor: 'var(--border)' }}
            >
              <p className="font-medium text-[var(--text-primary)]">
                {statusLabel(row.FromStatus)} → {statusLabel(row.ToStatus)}:{' '}
                {row.ActorName || '—'}, {formatEventAt(row.EventAt)}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
