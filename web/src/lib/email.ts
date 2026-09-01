import type { Translate } from '../../../shared/i18n';

/** Same rule as backend domain.ValidateEmail: local@host.tld with a real TLD. */
const EMAIL_PATTERN =
  /^[a-z0-9._%+\-]+@[a-z0-9](?:[a-z0-9\-]*[a-z0-9])?(?:\.[a-z]{2,})+$/i;

export function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email.trim());
}

export function emailDomain(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 0 || at === email.length - 1) return '';
  return email.slice(at + 1).trim().toLowerCase();
}

export function isAllowedEmailDomain(
  email: string,
  allowed: string[] | undefined,
): boolean {
  if (!allowed || allowed.length === 0) return true;
  const host = emailDomain(email);
  return allowed.some((d) => d.toLowerCase() === host);
}

export function allowedDomainsHint(
  t: Translate,
  allowed: string[] | undefined,
): string | null {
  if (!allowed || allowed.length === 0) return null;
  return t('email.allowedDomains', { listed: allowed.join(', ') });
}

export function emailCreateErrorMessage(
  t: Translate,
  email: string,
  allowed: string[] | undefined,
): string | null {
  const trimmed = email.trim();
  if (!trimmed) return null;
  if (!isValidEmail(trimmed)) return t('email.formatHint');
  if (!isAllowedEmailDomain(trimmed, allowed)) {
    return t('email.domainDenied', { listed: allowed!.join(', ') });
  }
  return null;
}
