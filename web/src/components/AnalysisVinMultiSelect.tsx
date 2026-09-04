import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useI18n } from '../i18n';
import { api, type Vehicle } from '../lib/api';

export type VinChip = Pick<Vehicle, 'VIN'>;

interface AnalysisVinMultiSelectProps {
  selected: VinChip[];
  onChange: (vehicles: VinChip[]) => void;
  className?: string;
  placeholder?: string;
}

/**
 * Analysis filter VIN multi-select — typeahead by suffix, chips for picks.
 * Identity is VIN only (no separate vehicle number).
 */
export function AnalysisVinMultiSelect({
  selected,
  onChange,
  className = '',
  placeholder,
}: AnalysisVinMultiSelectProps) {
  const { t } = useI18n();
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.searchVehicles(query.trim());
        const picked = new Set(selected.map((v) => v.VIN));
        setResults((res.items ?? []).filter((v) => !picked.has(v.VIN)));
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => window.clearTimeout(timer);
  }, [query, selected]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function add(v: Vehicle) {
    if (selected.some((s) => s.VIN === v.VIN)) return;
    onChange([...selected, { VIN: v.VIN }]);
    setQuery('');
    setResults([]);
    setOpen(false);
  }

  function remove(vin: string) {
    onChange(selected.filter((s) => s.VIN !== vin));
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => {
          if (results.length > 0) setOpen(true);
        }}
        placeholder={placeholder ?? t('analysis.vinSuffixPlaceholder')}
        className="min-h-9 w-full rounded-lg border bg-[var(--bg-page)] px-1.5 text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]"
        style={{ borderColor: 'var(--border)' }}
        aria-label={t('analysis.vinMultiAria')}
        aria-expanded={open}
      />
      {open && query.trim().length >= 2 && (
        <div
          className="absolute z-30 mt-1 max-h-48 w-full min-w-[14rem] overflow-auto rounded-lg border bg-[var(--bg-surface-1)] shadow-lg"
          style={{ borderColor: 'var(--border)' }}
        >
          {loading && (
            <p className="px-2 py-1.5 text-[12px] text-[var(--text-secondary)]">
              {t('common.searching')}
            </p>
          )}
          {!loading && results.length === 0 && (
            <p className="px-2 py-1.5 text-[12px] text-[var(--text-secondary)]">
              {t('common.noMatches')}
            </p>
          )}
          {results.map((v) => (
            <button
              key={v.VIN}
              type="button"
              className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-[12px] hover:bg-[var(--bg-surface-2)]"
              onClick={() => add(v)}
            >
              <span className="font-mono font-semibold text-[var(--accent)]">
                …{v.VIN.slice(-5)}
              </span>
              <span className="truncate text-[11px] text-[var(--text-secondary)]">
                {v.VIN}
              </span>
            </button>
          ))}
        </div>
      )}
      {selected.length > 0 && (
        <ul className="mt-1 flex flex-wrap gap-1">
          {selected.map((v) => (
            <li
              key={v.VIN}
              className="inline-flex max-w-full items-center gap-1 rounded-md border bg-[var(--bg-page)] px-1.5 py-0.5 text-[11px]"
              style={{ borderColor: 'var(--border)' }}
            >
              <span className="font-mono font-semibold text-[var(--accent)]">
                …{v.VIN.slice(-5)}
              </span>
              <button
                type="button"
                className="rounded p-0.5 text-[var(--text-secondary)] hover:bg-[var(--bg-surface-2)] hover:text-[var(--text-primary)]"
                aria-label={t('common.delete')}
                onClick={() => remove(v.VIN)}
              >
                <X size={11} strokeWidth={2.5} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
