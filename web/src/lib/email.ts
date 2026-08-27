/** Same rule as backend domain.ValidateEmail: local@host.tld with a real TLD. */
const EMAIL_PATTERN =
  /^[a-z0-9._%+\-]+@[a-z0-9](?:[a-z0-9\-]*[a-z0-9])?(?:\.[a-z]{2,})+$/i;

export const EMAIL_FORMAT_HINT =
  'Geçerli bir e-posta girin (alan adı uzantısı gerekli, örn. ad@sirket.com).';

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

export function allowedDomainsHint(allowed: string[] | undefined): string | null {
  if (!allowed || allowed.length === 0) return null;
  return `Yalnızca şu alan adları: ${allowed.join(', ')}`;
}

export function emailCreateErrorMessage(
  email: string,
  allowed: string[] | undefined,
): string | null {
  const trimmed = email.trim();
  if (!trimmed) return null;
  if (!isValidEmail(trimmed)) return EMAIL_FORMAT_HINT;
  if (!isAllowedEmailDomain(trimmed, allowed)) {
    return `Bu alan adına izin yok. Kabul edilenler: ${allowed!.join(', ')}`;
  }
  return null;
}
