import type { Translate } from '../../../shared/i18n';
import { translateApiError } from '../../../shared/i18n';

/** Maps backend domain/auth error strings to the active locale. */
export function apiErrorMessage(err: unknown, t: Translate): string {
  return translateApiError(t, err);
}
