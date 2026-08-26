import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api, type Vehicle } from '../lib/api';
import { lightTokens } from '../theme/tokens';
import { StatusBadge } from './StatusBadge';

interface VinSearchBoxProps {
  /** Controlled value (optional). */
  value?: string;
  onChange?: (suffix: string) => void;
  /** Typeahead matches — used by parents that pin a selected vehicle. */
  onResults?: (vehicles: Vehicle[]) => void;
  /** When true, show typeahead results under the input. */
  showResults?: boolean;
  /** Destination for a suggestion click. Defaults to vehicle overview. */
  resultTo?: (vehicle: Vehicle) => string;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  /** Always-white field — used in the header so dark theme does not ink the search. */
  onChrome?: boolean;
}

/**
 * Shared VIN suffix search (last 5 digits) — design guide §3.1 / §4.4.
 * Debounce 200ms; reused by vehicle list and Analysis filter bar.
 */
export function VinSearchBox({
  value: controlled,
  onChange,
  onResults,
  showResults = true,
  resultTo = (v) => `/vehicles/${v.VIN}`,
  placeholder = 'Son 5 haneyi girin (örn. 00057)',
  className = '',
  ariaLabel = 'VIN son 5 hane araması',
  onChrome = false,
}: VinSearchBoxProps) {
  const location = useLocation();
  const rootRef = useRef<HTMLDivElement>(null);
  const [internal, setInternal] = useState('');
  const suffix = controlled ?? internal;
  const [results, setResults] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const onResultsRef = useRef(onResults);
  onResultsRef.current = onResults;

  useEffect(() => {
    if (suffix.trim().length < 2) {
      setResults([]);
      setOpen(false);
      onResultsRef.current?.([]);
      return;
    }
    if (!showResults && !onResultsRef.current) {
      return;
    }
    const t = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.searchVehicles(suffix.trim());
        const items = res.items ?? [];
        setResults(items);
        onResultsRef.current?.(items);
        if (showResults) setOpen(true);
      } catch {
        setResults([]);
        onResultsRef.current?.([]);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => window.clearTimeout(t);
  }, [suffix, showResults]);

  useEffect(() => {
    setOpen(false);
    setResults([]);
    if (controlled === undefined) setInternal('');
  }, [location.pathname, controlled]);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function setSuffix(next: string) {
    if (controlled === undefined) setInternal(next);
    onChange?.(next);
  }

  function dismissAndClear() {
    setOpen(false);
    setResults([]);
    setSuffix('');
  }

  const showDropdown = showResults && open && suffix.trim().length >= 2;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <input
        type="text"
        value={suffix}
        onChange={(e) => setSuffix(e.target.value)}
        onFocus={() => {
          if (showResults && suffix.trim().length >= 2 && results.length > 0) {
            setOpen(true);
          }
        }}
        placeholder={placeholder}
        className={
          onChrome
            ? 'w-full rounded-lg border px-3 py-2 text-[15px] outline-none placeholder:text-[#5B6672] focus-visible:border-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]'
            : 'w-full rounded-lg border bg-[var(--bg-surface-1)] px-3 py-2 text-[15px] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] outline-none focus:border-[var(--accent)]'
        }
        style={
          onChrome
            ? {
                backgroundColor: lightTokens['bg-surface-1'],
                color: lightTokens['text-primary'],
              }
            : { borderColor: 'var(--border)' }
        }
        aria-label={ariaLabel}
        aria-expanded={showDropdown}
      />
      {showDropdown && (
        <div
          className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border bg-[var(--bg-surface-2)] shadow-lg"
          style={{ borderColor: 'var(--border)' }}
        >
          {loading && (
            <p className="px-3 py-2 text-[13px] text-[var(--text-secondary)]">
              Searching…
            </p>
          )}
          {!loading && results.length === 0 && (
            <p className="px-3 py-2 text-[13px] text-[var(--text-secondary)]">
              No matches
            </p>
          )}
          {!loading && results.length >= 2 && (
            <p className="border-b px-3 py-1.5 text-[12px] text-[var(--text-secondary)]"
              style={{ borderColor: 'var(--border)' }}>
              {results.length} araç eşleşti, doğrusunu seçin
            </p>
          )}
          {results.map((v) => {
            const vin = v.VIN;
            const tail = vin.slice(-5);
            return (
              <Link
                key={vin}
                to={resultTo(v)}
                className="flex items-center justify-between px-3 py-2 hover:bg-[var(--bg-surface-1)]"
                onClick={dismissAndClear}
              >
                <div>
                  <span className="text-[15px] font-semibold text-[var(--text-primary)]">
                    {tail}
                  </span>
                  <span className="ml-2 text-[13px] text-[var(--text-secondary)]">
                    {vin}
                  </span>
                </div>
                <StatusBadge kind="vehicle" value={v.CurrentGlobalStatus} />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
