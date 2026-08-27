import { apiErrorMessage } from './apiErrors';

/** User-facing copy of the backend password rule (domain.PasswordRuleHint). */
export const PASSWORD_RULE_HINT =
  'En az 8 karakter, en az bir harf ve bir rakam.';

/** Maps known API password/user errors to Turkish copy. */
export function passwordErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : 'İşlem başarısız';
  if (msg === 'invalid credentials') {
    return 'Mevcut şifre yanlış.';
  }
  return apiErrorMessage(err);
}
