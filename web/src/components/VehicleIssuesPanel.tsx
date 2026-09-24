import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '../i18n';
import { api, type Issue } from '../lib/api';
import { apiErrorMessage } from '../lib/apiErrors';
import { IssueList } from './IssueList';

/**
 * Vehicle Detail → Issues tab: adaptive issue cards for this VIN.
 * Card body opens `/issues/:id` (same detail page as the global Issues list).
 */
export function VehicleIssuesPanel({ vin }: { vin: string }) {
  const { t } = useI18n();
  const [items, setItems] = useState<Issue[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api.listIssues({ vin, unlimited: true });
      setItems(res.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? apiErrorMessage(err, t) : t('issue.listFailed'));
      setItems([]);
    }
  }, [vin, t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <h2 className="text-lg font-semibold">{t('vehicles.issueList')}</h2>
      <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
        {t('vehicles.issueListHint')}
      </p>

      {error && (
        <p className="mt-3 text-[13px]" style={{ color: 'var(--status-not-ok)' }}>
          {error}
        </p>
      )}

      <div className="mt-4">
        <IssueList
          items={items}
          emptyLabel={t('vehicles.noIssues')}
          hideVin
          onStatusChanged={() => void load()}
        />
      </div>
    </div>
  );
}
