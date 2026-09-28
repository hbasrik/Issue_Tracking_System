import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useI18n } from '../i18n';
import { ApiErrorText } from './ApiErrorText';

type Props = {
  /** What could not be loaded, e.g. t('vehicles.loadFailed'). */
  title: string;
  /** Raw API/transport error (translated here) or an already-translated string. */
  error: unknown;
  onRetry?: () => void;
  retrying?: boolean;
  /**
   * `block` replaces the content when nothing could be loaded.
   * `inline` sits above data that is still on screen but may be stale.
   */
  variant?: 'block' | 'inline';
  className?: string;
};

/**
 * "Could not reach the data" state. Deliberately looks different from an
 * empty result so a failed load is never mistaken for "no records".
 */
export function LoadErrorState({
  title,
  error,
  onRetry,
  retrying = false,
  variant = 'block',
  className = '',
}: Props) {
  const { t } = useI18n();
  const block = variant === 'block';
  return (
    <div
      className={`load-error-state ${block ? 'load-error-state--block' : 'load-error-state--inline'} ${className}`}
      data-testid="load-error-state"
    >
      <AlertTriangle size={block ? 20 : 16} aria-hidden className="load-error-state__icon" />
      <div className="min-w-0 flex-1">
        <p className="load-error-state__title">{title}</p>
        <ApiErrorText error={error} className="load-error-state__message" />
      </div>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="load-error-state__retry"
        >
          <RefreshCw size={14} aria-hidden className={retrying ? 'animate-spin' : undefined} />
          {t('common.retry')}
        </button>
      ) : null}
    </div>
  );
}
