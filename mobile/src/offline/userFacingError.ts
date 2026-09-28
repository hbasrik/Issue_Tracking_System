import { isServerError, isTransportError } from '../../../shared/networkError';
import { translateApiError, type Translate } from '../../../shared/i18n';

/**
 * Live reads (lists, detail, checklists) must not look like a broken form.
 * No response → calm "you're offline" copy. 5xx → server message plus the
 * request code to report. 4xx/domain → real error text.
 */
export function loadFailureMessage(err: unknown, t: Translate): {
  error: string | null;
  offlineHint: string | null;
} {
  if (isTransportError(err) && !isServerError(err)) {
    return { error: null, offlineHint: t('offline.liveUnavailable') };
  }
  return { error: translateApiError(t, err), offlineHint: null };
}
