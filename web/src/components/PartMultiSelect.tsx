import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { useI18n } from '../i18n';
import type { DefectPart } from '../lib/api';

type PartOption = Pick<DefectPart, 'ID' | 'ZoneID' | 'NameTR' | 'NameEN'>;

interface PartMultiSelectProps {
  parts: PartOption[];
  selectedIds: Set<number>;
  onChange: (next: Set<number>) => void;
  /** When non-empty, only parts in these zones are offered. */
  zoneIds: Set<number>;
  disabled?: boolean;
}

function partLabel(p: PartOption, locale: string): string {
  return locale === 'en' ? p.NameEN || p.NameTR : p.NameTR || p.NameEN;
}

/**
 * Multi-select for defect parts — dropdown list + removable tags.
 * Zone filter narrows the option list; selections outside the zone are hidden
 * from chips until the parent prunes them.
 */
export function PartMultiSelect({
  parts,
  selectedIds,
  onChange,
  zoneIds,
  disabled = false,
}: PartMultiSelectProps) {
  const { t, locale } = useI18n();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const options = useMemo(() => {
    const scoped =
      zoneIds.size === 0
        ? parts
        : parts.filter((p) => zoneIds.has(p.ZoneID));
    const q = query.trim().toLocaleLowerCase(locale === 'en' ? 'en' : 'tr');
    if (!q) return scoped;
    return scoped.filter((p) => partLabel(p, locale).toLocaleLowerCase().includes(q));
  }, [parts, zoneIds, query, locale]);

  const selectedParts = useMemo(
    () => parts.filter((p) => selectedIds.has(p.ID)),
    [parts, selectedIds],
  );

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function toggle(id: number) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  }

  function remove(id: number) {
    const next = new Set(selectedIds);
    next.delete(id);
    onChange(next);
  }

  return (
    <div ref={rootRef} className="relative min-w-0 max-w-full">
      {selectedParts.length > 0 ? (
        <div className="mb-2 flex max-w-full flex-wrap gap-1.5">
          {selectedParts.map((p) => (
            <span
              key={p.ID}
              className="inline-flex max-w-full items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold"
              style={{
                backgroundColor:
                  'color-mix(in srgb, var(--text-primary) 14%, var(--bg-surface-1))',
                color: 'var(--text-primary)',
              }}
            >
              <span className="truncate">{partLabel(p, locale)}</span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => remove(p.ID)}
                className="inline-flex shrink-0 rounded-full p-0.5 hover:bg-[var(--bg-surface-2)]"
                aria-label={t('common.clear')}
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-9 w-full max-w-md items-center justify-between gap-2 rounded-lg border bg-[var(--bg-page)] px-3 py-2 text-left text-[14px] text-[var(--text-primary)]"
        style={{ borderColor: 'var(--border)' }}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="truncate text-[var(--text-secondary)]">
          {t('issue.partFilterPlaceholder')}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[var(--text-secondary)] transition-transform ${
            open ? 'rotate-180' : ''
          }`}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          className="absolute z-30 mt-1 w-full max-w-md overflow-hidden rounded-lg border bg-[var(--bg-surface-1)] shadow-lg"
          style={{ borderColor: 'var(--border)' }}
          role="listbox"
          aria-multiselectable
        >
          <div className="border-b p-2" style={{ borderColor: 'var(--border)' }}>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('issue.partFilterSearch')}
              className="w-full rounded-md border bg-[var(--bg-page)] px-2 py-1.5 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]"
              style={{ borderColor: 'var(--border)' }}
              autoFocus
            />
          </div>
          <div className="max-h-56 overflow-auto">
            {options.length === 0 ? (
              <p className="px-3 py-2 text-[13px] text-[var(--text-secondary)]">
                {t('issue.partFilterNone')}
              </p>
            ) : (
              options.map((p) => {
                const selected = selectedIds.has(p.ID);
                return (
                  <button
                    key={p.ID}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-[var(--bg-surface-2)]"
                    style={{
                      color: selected
                        ? 'var(--text-primary)'
                        : 'var(--text-secondary)',
                      fontWeight: selected ? 600 : 500,
                      backgroundColor: selected
                        ? 'color-mix(in srgb, var(--text-primary) 10%, transparent)'
                        : undefined,
                    }}
                    onClick={() => toggle(p.ID)}
                  >
                    <span
                      className="flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px]"
                      style={{
                        borderColor: 'var(--border)',
                        backgroundColor: selected
                          ? 'var(--text-primary)'
                          : 'var(--bg-page)',
                        color: selected ? 'var(--bg-page)' : 'transparent',
                      }}
                      aria-hidden
                    >
                      ✓
                    </span>
                    <span className="truncate">{partLabel(p, locale)}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
