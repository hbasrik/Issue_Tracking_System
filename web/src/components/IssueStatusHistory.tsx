import { useEffect, useState } from 'react';
import { localeTag } from '../../../shared/i18n';
import { useI18n } from '../i18n';
import { api, type IssueStatusHistoryEntry } from '../lib/api';
import { apiErrorMessage } from '../lib/apiErrors';
import { issueStatusLabel } from '../lib/issueStatus';

function formatEventAt(iso: string, tag: string, emDash: string): string {
  if (!iso || iso.startsWith('0001')) return emDash;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(tag);
}

/** Chronological ISSUE_STATUS_CHANGE trail from GET /issues/:id/history. */
export function IssueStatusHistory({
  issueId,
  hideTitle,
}: {
  issueId: number;
  hideTitle?: boolean;
}) {
  const { t, locale } = useI18n();
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
          setError(
            err instanceof Error ? apiErrorMessage(err, t) : t('issueDetail.historyFailed'),
          );
          setItems([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [issueId, t]);

  return (
    <div>
      {!hideTitle && (
        <h3 className="text-[15px] font-semibold text-[var(--accent)]">
          {t('issueDetail.history')}
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
          {t('issueDetail.historyEmpty')}
        </p>
      )}
      {items.length > 0 && (
        <ol className="mt-2 space-y-2">
          {items.map((row) => (
            <li
              key={row.ID}
              className="text-[13px] text-[var(--text-primary)]"
            >
              <p className="font-medium text-[var(--text-primary)]">
                {issueStatusLabel(row.FromStatus, t)} → {issueStatusLabel(row.ToStatus, t)}:{' '}
                {row.ActorName || t('common.emDash')}, {formatEventAt(row.EventAt, localeTag(locale), t('common.emDash'))}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
