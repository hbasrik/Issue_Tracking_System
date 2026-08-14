import { useEffect, useMemo, useState } from 'react';
import { api, type ChecklistItem, type ChecklistType } from '../lib/api';
import { StatusBadge } from './StatusBadge';

interface ChecklistPanelProps {
  vin: string;
  type: ChecklistType;
  /** When set, only items whose EolPhase matches are shown (Branch / Depot). */
  eolPhase?: 'BRANCH' | 'DEPOT';
  title: string;
  hint?: string;
}

const PASSING = new Set(['OK', 'CONDITIONAL_OK']);

/** Progress-counter checklist used by Shipment, Test, and EoL stages. */
export function ChecklistPanel({
  vin,
  type,
  eolPhase,
  title,
  hint,
}: ChecklistPanelProps) {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError(null);
      try {
        const res = await api.getVehicleChecklist(vin, type);
        if (!cancelled) setItems(res.items ?? []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'failed to load checklist');
          setItems([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vin, type]);

  const visible = useMemo(() => {
    if (!eolPhase) return items;
    return items.filter((item) => item.EolPhase === eolPhase);
  }, [items, eolPhase]);

  const done = visible.filter((item) => PASSING.has(item.Status)).length;

  return (
    <div
      className="rounded-xl border bg-[var(--bg-surface-1)] p-5"
      style={{ borderColor: 'var(--border)' }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-[13px] text-[var(--text-secondary)]">
          {visible.length === 0 ? '0 items' : `${done}/${visible.length} passing`}
        </p>
      </div>
      {hint && (
        <p className="mt-1 text-[13px] text-[var(--text-secondary)]">{hint}</p>
      )}
      {error && (
        <p className="mt-3 text-[13px]" style={{ color: 'var(--status-not-ok)' }}>
          {error}
        </p>
      )}
      <ul className="mt-4 divide-y" style={{ borderColor: 'var(--border)' }}>
        {visible.map((item) => (
          <li
            key={item.ItemID}
            className="flex items-start justify-between gap-3 py-2.5 text-[15px]"
          >
            <span>
              <span className="mr-2 text-[13px] text-[var(--text-secondary)]">
                {item.ItemNo}.
              </span>
              {item.ItemText}
            </span>
            <StatusBadge
              kind={type === 'shipment' || type === 'test' ? 'shipment' : 'eol'}
              value={item.Status}
            />
          </li>
        ))}
      </ul>
      {visible.length === 0 && !error && (
        <p className="mt-3 text-[13px] text-[var(--text-secondary)]">
          No items for this stage
        </p>
      )}
    </div>
  );
}
