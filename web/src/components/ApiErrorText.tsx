import { useState } from 'react';
import { describeApiError } from '../../../shared/i18n';
import { useI18n } from '../i18n';

type Props = {
  /** Raw API/transport error, or a plain already-translated string. */
  error: unknown;
  className?: string;
};

/**
 * Renders an API failure message with an optional discreet, copyable
 * request-id line (5xx only — describeApiError already filters).
 */
export function ApiErrorText({ error, className }: Props) {
  const { t } = useI18n();
  const parts =
    typeof error === 'string'
      ? { message: error, requestId: undefined as string | undefined }
      : describeApiError(t, error);
  const { message, requestId } = parts;
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    if (!requestId) return;
    try {
      await navigator.clipboard.writeText(requestId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore — user can still select the text */
    }
  }

  return (
    <div className={className} role="alert">
      <p className="api-error-message">{message}</p>
      {requestId ? (
        <button
          type="button"
          className="api-error-request-code"
          onClick={copyCode}
          title={t('common.copy')}
        >
          {t('error.requestCode', { id: requestId })}
          {copied ? ` · ${t('common.copied')}` : ''}
        </button>
      ) : null}
    </div>
  );
}
