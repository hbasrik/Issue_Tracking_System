import { useCallback, useEffect, useState } from 'react';
import { api, type Issue } from '../lib/api';
import { IssueList } from './IssueList';

/**
 * Vehicle Detail → Issues tab: clickable issue cards for this VIN.
 * Detail opens in the side panel on desktop and as an accordion under the
 * card on phone/tablet — same pattern as the global Issues page.
 */
export function VehicleIssuesPanel({ vin }: { vin: string }) {
  const [items, setItems] = useState<Issue[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api.listIssues(undefined, vin);
      setItems(res.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load issues');
      setItems([]);
    }
  }, [vin]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <h2 className="text-lg font-semibold">Vehicle issues</h2>
      <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
        All issues for this VIN — open and closed
      </p>

      {error && (
        <p className="mt-3 text-[13px]" style={{ color: 'var(--status-not-ok)' }}>
          {error}
        </p>
      )}

      <div className="mt-4">
        <IssueList
          items={items}
          emptyLabel="No issues for this vehicle"
          hideVin
          onStatusChanged={() => void load()}
        />
      </div>
    </div>
  );
}
