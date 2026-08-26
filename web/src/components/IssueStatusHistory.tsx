import { useEffect, useState } from 'react';
import { api, type IssueStatusHistoryEntry } from '../lib/api';
import { issueStatusLabel } from '../lib/issueStatus';

function formatEventAt(iso: string): string {
  if (!iso || iso.startsWith('0001')) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('tr-TR');
}

/** Chronological ISSUE_STATUS_CHANGE trail from GET /issues/:id/history. */
export function IssueStatusHistory({
  issueId,
  hideTitle,
}: {
  issueId: number;
  hideTitle?: boolean;
}) {
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
      {!hideTitle && (
        <h3 className="text-[15px] font-semibold text-[var(--accent)]">
          Durum Geçmişi
        </h3>
      )}
      {error && (
        <p className="mt-2 text-[13px]" style={{ color: 'var(--status-not-ok)' }}>
          {error}
        </p>
      )}
      {!error && items.length === 0 && (
        <p
          className="mt-2 text-[13px]"
          style={{ color: 'var(--text-secondary)' }}
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
                {issueStatusLabel(row.FromStatus)} → {issueStatusLabel(row.ToStatus)}:{' '}
                {row.ActorName || '—'}, {formatEventAt(row.EventAt)}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
