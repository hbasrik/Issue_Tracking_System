import { isTransportError } from '../../../shared/networkError';
import { translateApiError, type Translate } from '../../../shared/i18n';

/**
 * Live reads (lists, detail, checklists) must not look like a broken form.
 * Transport → calm "you're offline" copy. 4xx/domain → real error text.
 */
export function loadFailureMessage(err: unknown, t: Translate): {
  error: string | null;
  offlineHint: string | null;
} {
  if (isTransportError(err)) {
    return { error: null, offlineHint: t('offline.liveUnavailable') };
  }
  return { error: translateApiError(t, err), offlineHint: null };
}
