import { ActionStamp } from './ActionStamp';
import type { VehicleStatusHistoryEntry } from '../lib/api';

/** Chronological vehicle STATUS_CHANGE trail. */
export function VehicleStatusHistory({
  items,
  error,
}: {
  items: VehicleStatusHistoryEntry[];
  error?: string | null;
}) {
  return (
    <div
      className="rounded-xl border bg-[var(--bg-surface-1)] p-5"
      style={{ borderColor: 'var(--border)' }}
    >
      <h2 className="text-lg font-semibold">Durum geçmişi</h2>
      {error ? (
        <p className="mt-2 text-[13px]" style={{ color: 'var(--status-not-ok)' }}>
          {error}
        </p>
      ) : null}
      {!error && items.length === 0 ? (
        <p className="mt-2 text-[13px] text-[var(--text-secondary)]">
          Henüz durum değişikliği yok
        </p>
      ) : null}
      {items.length > 0 ? (
        <ol className="mt-3 space-y-3">
          {items.map((row) => (
            <li key={row.ID}>
              <p className="text-[15px] font-medium">
                {row.FromStatus || '—'} → {row.ToStatus || '—'}
              </p>
              <ActionStamp name={row.ActorName} at={row.EventAt} />
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
