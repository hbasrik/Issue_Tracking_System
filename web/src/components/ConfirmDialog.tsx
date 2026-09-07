import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  createContext,
  useContext,
} from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../i18n';

export type ConfirmTone = 'default' | 'danger' | 'warning';

export type ConfirmRequest = {
  title: string;
  message: string;
  /** confirm = Cancel + Confirm; alert = single dismiss button */
  mode?: 'confirm' | 'alert';
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
};

type ConfirmFn = (req: ConfirmRequest) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/** Promise-based app confirm/alert — replaces window.confirm / alert. */
export function useConfirm(): ConfirmFn {
  const fn = useContext(ConfirmContext);
  if (!fn) {
    throw new Error('useConfirm must be used within ConfirmProvider');
  }
  return fn;
}

type Pending = ConfirmRequest & {
  resolve: (value: boolean) => void;
};

function toneConfirmStyle(tone: ConfirmTone): React.CSSProperties {
  if (tone === 'danger') {
    return { backgroundColor: 'var(--status-not-ok)', color: '#fff' };
  }
  if (tone === 'warning') {
    return { backgroundColor: 'var(--status-conditional-ok)', color: '#111' };
  }
  return { backgroundColor: 'var(--accent)', color: '#fff' };
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [pending, setPending] = useState<Pending | null>(null);

  const confirm = useCallback<ConfirmFn>((req) => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...req, resolve });
    });
  }, []);

  const close = useCallback((value: boolean) => {
    setPending((cur) => {
      cur?.resolve(value);
      return null;
    });
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending ? (
        <ConfirmDialogView
          title={pending.title}
          message={pending.message}
          mode={pending.mode ?? 'confirm'}
          confirmLabel={
            pending.confirmLabel ??
            (pending.mode === 'alert' ? t('common.close') : t('common.confirm'))
          }
          cancelLabel={pending.cancelLabel ?? t('common.cancel')}
          tone={pending.tone ?? (pending.mode === 'alert' ? 'default' : 'default')}
          onConfirm={() => close(true)}
          onCancel={() => close(false)}
        />
      ) : null}
    </ConfirmContext.Provider>
  );
}

function ConfirmDialogView({
  title,
  message,
  mode,
  confirmLabel,
  cancelLabel,
  tone,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  mode: 'confirm' | 'alert';
  confirmLabel: string;
  cancelLabel: string;
  tone: ConfirmTone;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

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
        if (mode === 'alert') onConfirm();
        else onCancel();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [mode, onCancel, onConfirm]);

  const dismiss = mode === 'alert' ? onConfirm : onCancel;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/45"
        aria-label={cancelLabel}
        onClick={dismiss}
      />
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="relative z-[1] w-full max-w-md rounded-xl border bg-[var(--bg-surface-1)] p-5 shadow-lg outline-none"
        style={{ borderColor: 'var(--border)' }}
      >
        <h2 id={titleId} className="text-lg font-semibold text-[var(--text-primary)]">
          {title}
        </h2>
        <p
          id={descId}
          className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-[var(--text-secondary)]"
        >
          {message}
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {mode === 'confirm' ? (
            <button
              type="button"
              className="min-h-touch rounded-lg border px-4 text-[15px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-surface-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              style={{ borderColor: 'var(--border)' }}
              onClick={onCancel}
            >
              {cancelLabel}
            </button>
          ) : null}
          <button
            ref={primaryRef}
            type="button"
            className="min-h-touch rounded-lg px-4 text-[15px] font-medium hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            style={toneConfirmStyle(tone)}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
