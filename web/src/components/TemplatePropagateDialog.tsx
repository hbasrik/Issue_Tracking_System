import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../i18n';
import type {
  PropagationScope,
  TemplateItemPropagationImpact,
} from '../lib/api';

function countsForScope(
  impact: TemplateItemPropagationImpact,
  scope: PropagationScope,
): { affected: number; protected: number } {
  if (scope === 'incomplete') {
    return {
      affected: impact.IncompleteAffected ?? impact.Affected,
      protected: impact.IncompleteProtected ?? impact.Protected,
    };
  }
  return {
    affected: impact.NotStartedAffected ?? impact.Affected,
    protected: impact.NotStartedProtected ?? impact.Protected,
  };
}

/** Scope picker for create / reactivate backfill. */
export function TemplatePropagateDialog({
  title,
  impact,
  onConfirm,
  onCancel,
}: {
  title: string;
  impact: TemplateItemPropagationImpact;
  onConfirm: (scope: PropagationScope) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [scope, setScope] = useState<PropagationScope>('not_started');
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const { affected, protected: protectedCount } = countsForScope(impact, scope);

  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    primaryRef.current?.focus();
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
      previouslyFocused.current?.focus?.();
    };
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/45"
        aria-label={t('common.cancel')}
        onClick={onCancel}
      />
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="relative z-[1] w-full max-w-lg rounded-xl border bg-[var(--bg-surface-1)] p-5 shadow-lg outline-none"
        style={{ borderColor: 'var(--border)' }}
      >
        <h2 id={titleId} className="text-lg font-semibold text-[var(--text-primary)]">
          {title}
        </h2>
        <p
          id={descId}
          className="mt-2 text-[15px] leading-relaxed text-[var(--text-secondary)]"
        >
          {t('templates.scopePrompt')}
        </p>

        <fieldset className="mt-4 space-y-3">
          <legend className="sr-only">{t('templates.scopeLegend')}</legend>
          <label className="flex cursor-pointer gap-3 rounded-lg border p-3 hover:bg-[var(--bg-surface-2)]"
            style={{ borderColor: scope === 'not_started' ? 'var(--accent)' : 'var(--border)' }}
          >
            <input
              type="radio"
              name="propagation-scope"
              className="mt-1"
              checked={scope === 'not_started'}
              onChange={() => setScope('not_started')}
            />
            <span className="min-w-0">
              <span className="block text-[15px] font-medium text-[var(--text-primary)]">
                {t('templates.scopeNotStarted')}
              </span>
              <span className="mt-1 block text-[13px] text-[var(--text-secondary)]">
                {t('templates.scopeNotStartedHint', {
                  affected: impact.NotStartedAffected ?? impact.Affected,
                  protected: impact.NotStartedProtected ?? impact.Protected,
                })}
              </span>
            </span>
          </label>
          <label
            className="flex cursor-pointer gap-3 rounded-lg border p-3 hover:bg-[var(--bg-surface-2)]"
            style={{ borderColor: scope === 'incomplete' ? 'var(--accent)' : 'var(--border)' }}
          >
            <input
              type="radio"
              name="propagation-scope"
              className="mt-1"
              checked={scope === 'incomplete'}
              onChange={() => setScope('incomplete')}
            />
            <span className="min-w-0">
              <span className="block text-[15px] font-medium text-[var(--text-primary)]">
                {t('templates.scopeIncomplete')}
              </span>
              <span className="mt-1 block text-[13px] text-[var(--text-secondary)]">
                {t('templates.scopeIncompleteHint', {
                  affected: impact.IncompleteAffected ?? impact.Affected,
                  protected: impact.IncompleteProtected ?? impact.Protected,
                })}
              </span>
            </span>
          </label>
        </fieldset>

        <p className="mt-4 text-[15px] leading-relaxed text-[var(--text-primary)]">
          {t('templates.scopeSummary', {
            affected,
            protected: protectedCount,
          })}
        </p>

        {scope === 'incomplete' ? (
          <p
            className="mt-3 rounded-lg px-3 py-2 text-[13px] leading-relaxed"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--status-conditional-ok) 22%, transparent)',
              color: 'var(--text-primary)',
            }}
          >
            {t('templates.scopeIncompleteWarning')}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="min-h-touch rounded-lg border px-4 text-[15px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-surface-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            style={{ borderColor: 'var(--border)' }}
            onClick={onCancel}
          >
            {t('common.cancel')}
          </button>
          <button
            ref={primaryRef}
            type="button"
            className="min-h-touch rounded-lg bg-[var(--accent)] px-4 text-[15px] font-medium text-white hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            onClick={() => onConfirm(scope)}
          >
            {t('common.confirm')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
