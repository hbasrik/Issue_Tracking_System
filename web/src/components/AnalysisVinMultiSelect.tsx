import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { useI18n } from '../i18n';
import { api, type Vehicle } from '../lib/api';
import { AnchoredPopover } from './AnchoredPopover';

export type VinChip = Pick<Vehicle, 'VIN'>;

interface AnalysisVinMultiSelectProps {
  selected: VinChip[];
  onChange: (vehicles: VinChip[]) => void;
  className?: string;
  placeholder?: string;
}

/**
 * Analysis filter VIN multi-select — typeahead by suffix, chips for picks.
 * Identity is VIN only (no separate vehicle number). Suggestions are portaled
 * because the filter bar scrolls horizontally (overflow-x-auto clips y too).
 */
export function AnalysisVinMultiSelect({
  selected,
  onChange,
  className = '',
  placeholder,
}: AnalysisVinMultiSelectProps) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

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
    setActiveIndex(0);
  }, [results]);

  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

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

  const showList = open && query.trim().length >= 2;

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!showList && results.length > 0) {
        setOpen(true);
        return;
      }
      if (results.length > 0) setActiveIndex((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (results.length > 0) {
        setActiveIndex((i) => (i - 1 + results.length) % results.length);
      }
    } else if (e.key === 'Enter') {
      if (!showList) return;
      e.preventDefault();
      const v = results[activeIndex];
      if (v) add(v);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  const activeId =
    showList && results[activeIndex] ? `${listboxId}-opt-${activeIndex}` : undefined;

  return (
    <div className={`relative ${className}`}>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => {
          if (results.length > 0) setOpen(true);
        }}
        onKeyDown={onKeyDown}
        placeholder={placeholder ?? t('analysis.vinSuffixPlaceholder')}
        className="min-h-9 w-full rounded-lg border bg-[var(--bg-page)] px-1.5 text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]"
        style={{ borderColor: 'var(--border)' }}
        aria-label={t('analysis.vinMultiAria')}
        role="combobox"
        aria-expanded={showList}
        aria-controls={showList ? listboxId : undefined}
        aria-activedescendant={activeId}
        aria-autocomplete="list"
      />
      <AnchoredPopover
        anchorRef={inputRef}
        open={showList}
        onClose={() => setOpen(false)}
        minWidth={224}
        maxHeight={192}
        className="bg-[var(--bg-surface-1)]"
      >
        <div
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-label={t('analysis.vinMultiAria')}
          className="min-h-0 flex-1 overflow-auto overscroll-contain"
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
          {results.map((v, index) => (
            <div
              key={v.VIN}
              id={`${listboxId}-opt-${index}`}
              data-index={index}
              role="option"
              aria-selected={index === activeIndex}
              className="flex w-full cursor-pointer items-center justify-between gap-2 px-2 py-1.5 text-left text-[12px] hover:bg-[var(--bg-surface-2)]"
              style={{
                backgroundColor: index === activeIndex ? 'var(--bg-surface-2)' : undefined,
                boxShadow: index === activeIndex ? 'inset 2px 0 0 var(--accent)' : undefined,
              }}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => add(v)}
            >
              <span className="font-mono font-semibold text-[var(--accent)]">
                …{v.VIN.slice(-5)}
              </span>
              <span className="truncate text-[11px] text-[var(--text-secondary)]">
                {v.VIN}
              </span>
            </div>
          ))}
        </div>
      </AnchoredPopover>
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
