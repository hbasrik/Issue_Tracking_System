import type { Translate } from '../../../shared/i18n';
import { translatePasswordError } from '../../../shared/i18n';
import { apiErrorMessage } from './apiErrors';

/** User-facing copy of the backend password rule (domain.PasswordRuleHint). */
export function passwordRuleHint(t: Translate): string {
  return t('password.ruleHint');
}

/** Maps known API password/user errors to the active locale. */
export function passwordErrorMessage(err: unknown, t: Translate): string {
  const msg = err instanceof Error ? err.message : '';
  if (msg === 'invalid credentials') {
    return translatePasswordError(t, err);
  }
  return apiErrorMessage(err, t);
}
