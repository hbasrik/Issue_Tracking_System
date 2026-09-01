import type { Translate } from '../../../shared/i18n';
import { translateApiError, translatePasswordError } from '../../../shared/i18n';

export function apiErrorMessage(err: unknown, t: Translate): string {
  return translateApiError(t, err);
}

export function passwordRuleHint(t: Translate): string {
  return t('password.ruleHint');
}

export function passwordErrorMessage(err: unknown, t: Translate): string {
  return translatePasswordError(t, err);
}
