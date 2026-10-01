import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { useI18n } from '../i18n';
import type { DefectPart } from '../lib/api';
import { AnchoredPopover } from './AnchoredPopover';

type PartOption = Pick<DefectPart, 'ID' | 'ZoneID' | 'NameTR' | 'NameEN'> &
  Partial<Pick<DefectPart, 'IsActive' | 'ZoneIsActive'>>;

interface PartMultiSelectProps {
  parts: PartOption[];
  selectedIds: Set<number>;
  onChange: (next: Set<number>) => void;
  /** When non-empty, only parts in these zones are offered. */
  zoneIds: Set<number>;
  disabled?: boolean;
}

function partLabel(p: PartOption, locale: string, inactiveSuffix: string): string {
  const name = locale === 'en' ? p.NameEN || p.NameTR : p.NameTR || p.NameEN;
  const inactive = p.IsActive === false || p.ZoneIsActive === false;
  return inactive ? `${name}${inactiveSuffix}` : name;
}

/**
 * Multi-select for defect parts — dropdown list + removable tags.
 * Zone filter narrows the option list; selections outside the zone are hidden
 * from chips until the parent prunes them. The list is portaled (see
 * AnchoredPopover) so filter cards with overflow clipping cannot cut it off.
 */
export function PartMultiSelect({
  parts,
  selectedIds,
  onChange,
  zoneIds,
  disabled = false,
}: PartMultiSelectProps) {
  const { t, locale } = useI18n();
  const inactiveSuffix = t('catalog.inactiveSuffix');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const options = useMemo(() => {
    const scoped =
      zoneIds.size === 0
        ? parts
        : parts.filter((p) => zoneIds.has(p.ZoneID));
    const q = query.trim().toLocaleLowerCase(locale === 'en' ? 'en' : 'tr');
    if (!q) return scoped;
    return scoped.filter((p) =>
      partLabel(p, locale, inactiveSuffix).toLocaleLowerCase().includes(q),
    );
  }, [parts, zoneIds, query, locale, inactiveSuffix]);

  const selectedParts = useMemo(
    () => parts.filter((p) => selectedIds.has(p.ID)),
    [parts, selectedIds],
  );

  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-index="${activeIndex}"]`,
    );
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

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

  function close(refocus = false) {
    setOpen(false);
    setQuery('');
    if (refocus) triggerRef.current?.focus();
  }

  function onTriggerKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
    }
  }

  function onSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (options.length > 0) setActiveIndex((i) => (i + 1) % options.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (options.length > 0) {
        setActiveIndex((i) => (i - 1 + options.length) % options.length);
      }
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActiveIndex(Math.max(options.length - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const opt = options[activeIndex];
      if (opt) toggle(opt.ID);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
    } else if (e.key === 'Tab') {
      close();
    }
  }

  const activeId =
    open && options[activeIndex] ? `${listboxId}-opt-${options[activeIndex].ID}` : undefined;

  return (
    <div className="relative w-full min-w-0">
      {selectedParts.length > 0 ? (
        <div className="mb-2 flex w-full max-w-full flex-wrap gap-1.5">
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
              <span className="truncate">{partLabel(p, locale, inactiveSuffix)}</span>
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
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={onTriggerKeyDown}
        className="flex min-h-9 w-full items-center justify-between gap-2 rounded-lg border bg-[var(--bg-page)] px-3 py-2 text-left text-[14px] text-[var(--text-primary)]"
        style={{ borderColor: 'var(--border)' }}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listboxId : undefined}
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

      <AnchoredPopover
        anchorRef={triggerRef}
        open={open}
        onClose={() => close()}
        minWidth={224}
        maxHeight={320}
        className="bg-[var(--bg-surface-1)]"
      >
        <div className="shrink-0 border-b p-2" style={{ borderColor: 'var(--border)' }}>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKeyDown}
            placeholder={t('issue.partFilterSearch')}
            className="w-full rounded-md border bg-[var(--bg-page)] px-2 py-1.5 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]"
            style={{ borderColor: 'var(--border)' }}
            role="combobox"
            aria-expanded
            aria-controls={listboxId}
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            autoFocus
          />
        </div>
        <div
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-multiselectable
          aria-label={t('issue.filterPart')}
          className="min-h-0 flex-1 overflow-auto overscroll-contain"
        >
          {options.length === 0 ? (
            <p className="px-3 py-2 text-[13px] text-[var(--text-secondary)]">
              {t('issue.partFilterNone')}
            </p>
          ) : (
            options.map((p, index) => {
              const selected = selectedIds.has(p.ID);
              const active = index === activeIndex;
              return (
                <div
                  key={p.ID}
                  id={`${listboxId}-opt-${p.ID}`}
                  data-index={index}
                  role="option"
                  aria-selected={selected}
                  className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-[var(--bg-surface-2)]"
                  style={{
                    color: selected ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontWeight: selected ? 600 : 500,
                    backgroundColor: active
                      ? 'var(--bg-surface-2)'
                      : selected
                        ? 'color-mix(in srgb, var(--text-primary) 10%, transparent)'
                        : undefined,
                    boxShadow: active ? 'inset 2px 0 0 var(--accent)' : undefined,
                  }}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => toggle(p.ID)}
                >
                  <span
                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px]"
                    style={{
                      borderColor: 'var(--border)',
                      backgroundColor: selected ? 'var(--text-primary)' : 'var(--bg-page)',
                      color: selected ? 'var(--bg-page)' : 'transparent',
                    }}
                    aria-hidden
                  >
                    ✓
                  </span>
                  <span className="truncate">{partLabel(p, locale, inactiveSuffix)}</span>
                </div>
              );
            })
          )}
        </div>
      </AnchoredPopover>
    </div>
  );
}
