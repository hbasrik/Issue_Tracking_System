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
      setError(err instanceof Error ? err.message : 'Issue listesi yüklenemedi');
      setItems([]);
    }
  }, [vin]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <h2 className="text-lg font-semibold">Araç issue listesi</h2>
      <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
        Bu VIN'e ait tüm issue kayıtları
      </p>

      {error && (
        <p className="mt-3 text-[13px]" style={{ color: 'var(--status-not-ok)' }}>
          {error}
        </p>
      )}

      <div className="mt-4">
        <IssueList
          items={items}
          emptyLabel="Bu araç için issue yok"
          hideVin
          onStatusChanged={() => void load()}
        />
      </div>
    </div>
  );
}
