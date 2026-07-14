import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Vehicle } from '../lib/api';
import { StatusBadge } from './StatusBadge';

interface VinSearchBoxProps {
  /** Controlled value (optional). */
  value?: string;
  onChange?: (suffix: string) => void;
  /** When true, show typeahead results under the input. */
  showResults?: boolean;
  placeholder?: string;
  className?: string;
}

/**
 * Shared VIN suffix search (last 5 digits) — design guide §3.1 / §4.4.
 * Debounce 200ms; reused by vehicle list and Analysis filter bar.
 */
export function VinSearchBox({
  value: controlled,
  onChange,
  showResults = true,
  placeholder = 'Son 5 haneyi girin (örn. 00057)',
  className = '',
}: VinSearchBoxProps) {
  const [internal, setInternal] = useState('');
  const suffix = controlled ?? internal;
  const [results, setResults] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!showResults || suffix.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.searchVehicles(suffix.trim());
        setResults(res.items ?? []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => window.clearTimeout(t);
  }, [suffix, showResults]);

  function setSuffix(next: string) {
    if (controlled === undefined) setInternal(next);
    onChange?.(next);
  }

  return (
    <div className={`relative ${className}`}>
      <input
        type="text"
        value={suffix}
        onChange={(e) => setSuffix(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border bg-[var(--bg-surface-1)] px-3 py-2 text-[15px] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] outline-none focus:border-[var(--accent)]"
        style={{ borderColor: 'var(--border)' }}
        aria-label="VIN suffix search"
      />
      {showResults && suffix.trim().length >= 2 && (
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
                to={`/vehicles/${vin}`}
                className="flex items-center justify-between px-3 py-2 hover:bg-[var(--bg-surface-1)]"
                onClick={() => setSuffix(tail)}
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
