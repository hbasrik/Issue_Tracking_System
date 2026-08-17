import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  api,
  ApiError,
  type ChecklistItem,
  type ChecklistType,
} from '../lib/api';
import { StatusBadge } from './StatusBadge';
import { statusColors } from '../theme/tokens';

interface ChecklistPanelProps {
  vin: string;
  type: ChecklistType;
  /** When set, only items whose EolPhase matches are shown (Branch / Depot). */
  eolPhase?: 'BRANCH' | 'DEPOT';
  title: string;
  hint?: string;
}

const PASSING = new Set(['OK', 'CONDITIONAL_OK']);
const EOL_STATUSES = ['OK', 'NOT_OK', 'REWORK', 'CONDITIONAL_OK'] as const;
type EolStatus = (typeof EOL_STATUSES)[number];

const STATUS_COLOR: Record<EolStatus, string> = {
  OK: statusColors.ok,
  NOT_OK: statusColors.notOk,
  REWORK: statusColors.rework,
  CONDITIONAL_OK: statusColors.conditionalOk,
};

function needsDescription(status: string): boolean {
  return status === 'NOT_OK' || status === 'REWORK' || status === 'CONDITIONAL_OK';
}

function existingDescription(item: ChecklistItem): string {
  return item.ReworkDesc || item.ConditionalDesc || item.RejectedDesc || '';
}

function bodyForStatus(status: string, desc: string): {
  status: string;
  rework_desc?: string;
  conditional_desc?: string;
  rejected_desc?: string;
} {
  const trimmed = desc.trim();
  if (status === 'REWORK') return { status, rework_desc: trimmed };
  if (status === 'CONDITIONAL_OK') return { status, conditional_desc: trimmed };
  if (status === 'NOT_OK') return { status, rejected_desc: trimmed };
  return { status };
}

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

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api.getVehicleChecklist(vin, type);
      setItems(res.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to load checklist');
      setItems([]);
    }
  }, [vin, type]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    if (!eolPhase) return items;
    return items.filter((item) => item.EolPhase === eolPhase);
  }, [items, eolPhase]);

  const done = visible.filter((item) => PASSING.has(item.Status)).length;
  const editor = type === 'eol' ? 'eol' : 'yesno';

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
        {visible.map((item) =>
          editor === 'eol' ? (
            <EolItemRow key={item.ItemID} vin={vin} item={item} onSaved={load} />
          ) : (
            <YesNoItemRow
              key={item.ItemID}
              vin={vin}
              type={type}
              item={item}
              onSaved={load}
            />
          ),
        )}
      </ul>
      {visible.length === 0 && !error && (
        <p className="mt-3 text-[13px] text-[var(--text-secondary)]">
          No items for this stage
        </p>
      )}
    </div>
  );
}

function EolItemRow({
  vin,
  item,
  onSaved,
}: {
  vin: string;
  item: ChecklistItem;
  onSaved: () => Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const savedStatus = (EOL_STATUSES as readonly string[]).includes(item.Status)
    ? (item.Status as EolStatus)
    : '';
  const [status, setStatus] = useState<string>(savedStatus);
  const [desc, setDesc] = useState(existingDescription(item));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const next = (EOL_STATUSES as readonly string[]).includes(item.Status)
      ? item.Status
      : '';
    setStatus(next);
    setDesc(existingDescription(item));
  }, [item]);

  async function save() {
    if (!status) {
      setError('Select OK, NOT_OK, REWORK, or CONDITIONAL_OK');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.recordChecklist(vin, 'eol', item.ItemID, bodyForStatus(status, desc));
      const file = fileRef.current?.files?.[0];
      if (file) {
        const progressId = item.ProgressID;
        if (!progressId) {
          throw new Error('item saved but has no progress id for photo upload');
        }
        await api.uploadMedia('CHECKLIST_ITEM_PROGRESS', String(progressId), file);
        if (fileRef.current) fileRef.current.value = '';
      }
      await onSaved();
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'save failed';
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="py-3 text-[15px]">
      <div className="flex items-start justify-between gap-3">
        <span>
          <span className="mr-2 text-[13px] text-[var(--text-secondary)]">
            {item.ItemNo}.
          </span>
          {item.ItemText}
        </span>
        <StatusBadge kind="eol" value={item.Status} />
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {EOL_STATUSES.map((value) => {
          const selected = status === value;
          const color = STATUS_COLOR[value];
          return (
            <button
              key={value}
              type="button"
              onClick={() => setStatus(value)}
              className="rounded-lg border px-2.5 py-1 text-[12px] font-medium"
              style={{
                borderColor: selected ? color : 'var(--border)',
                color: selected ? color : 'var(--text-secondary)',
                backgroundColor: selected ? `${color}22` : 'transparent',
              }}
            >
              {value === 'CONDITIONAL_OK' ? 'CONDITIONAL_OK' : value}
            </button>
          );
        })}
      </div>
      {needsDescription(status) && (
        <textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          required
          placeholder="Description required for this status"
          className="mt-2 w-full rounded-lg border bg-[var(--bg-page)] px-3 py-2 text-[13px] outline-none"
          style={{ borderColor: 'var(--status-not-ok)', minHeight: 64 }}
        />
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="text-[13px] text-[var(--text-secondary)]">
          Photo
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="ml-2 text-[13px]"
          />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-[13px] text-white disabled:opacity-60"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
      {error && (
        <p className="mt-2 text-[13px]" style={{ color: 'var(--status-not-ok)' }} role="alert">
          {error}
        </p>
      )}
    </li>
  );
}

function YesNoItemRow({
  vin,
  type,
  item,
  onSaved,
}: {
  vin: string;
  type: ChecklistType;
  item: ChecklistItem;
  onSaved: () => Promise<void>;
}) {
  const [yes, setYes] = useState(PASSING.has(item.Status));
  const [note, setNote] = useState(existingDescription(item));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setYes(PASSING.has(item.Status));
    setNote(existingDescription(item));
  }, [item]);

  async function save() {
    if (!yes && !note.trim()) {
      setError('description is required for this status');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const status = yes ? 'OK' : 'NOT_OK';
      await api.recordChecklist(vin, type, item.ItemID, bodyForStatus(status, note));
      await onSaved();
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'save failed';
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="py-3 text-[15px]">
      <div className="flex items-start justify-between gap-3">
        <label className="flex flex-1 items-start gap-3">
          <input
            type="checkbox"
            checked={yes}
            onChange={(e) => setYes(e.target.checked)}
            className="mt-1 h-4 w-4"
          />
          <span>
            <span className="mr-2 text-[13px] text-[var(--text-secondary)]">
              {item.ItemNo}.
            </span>
            {item.ItemText}
            <span className="ml-2 text-[13px] text-[var(--text-secondary)]">
              {yes ? 'Yes (OK)' : 'No (NOT_OK)'}
            </span>
          </span>
        </label>
        <StatusBadge kind="shipment" value={item.Status} />
      </div>
      {!yes && (
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          required
          placeholder="Note required when No"
          className="mt-2 w-full rounded-lg border bg-[var(--bg-page)] px-3 py-2 text-[13px] outline-none"
          style={{ borderColor: 'var(--status-not-ok)', minHeight: 52 }}
        />
      )}
      <div className="mt-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-[13px] text-white disabled:opacity-60"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
      {error && (
        <p className="mt-2 text-[13px]" style={{ color: 'var(--status-not-ok)' }} role="alert">
          {error}
        </p>
      )}
    </li>
  );
}
