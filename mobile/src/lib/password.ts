/** User-facing copy of the backend password rule (domain.PasswordRuleHint). */
export const PASSWORD_RULE_HINT =
  'En az 8 karakter, en az bir harf ve bir rakam.';

/** Maps known API password/user errors to Turkish copy. */
export function passwordErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : 'İşlem başarısız';
  switch (msg) {
    case 'invalid credentials':
      return 'Mevcut şifre yanlış.';
    case 'password must be at least 8 characters':
      return 'Şifre en az 8 karakter olmalı.';
    case 'password must contain at least one letter and one digit':
      return 'Şifre en az bir harf ve bir rakam içermeli.';
    case 'new password and confirmation do not match':
      return 'Yeni şifre ve tekrarı eşleşmiyor.';
    default:
      return msg;
  }
}
