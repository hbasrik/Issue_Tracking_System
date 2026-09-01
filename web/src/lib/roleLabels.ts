import type { Translate } from '../../../shared/i18n';

const FALLBACK_KEYS = {
  MANAGER_ADMIN: 'role.MANAGER_ADMIN',
  OPERATOR: 'role.OPERATOR',
  QUALITY: 'role.QUALITY',
  ASSEMBLY: 'role.ASSEMBLY',
} as const;

/** Readable role names — never show the raw catalogue code in chrome. */
export function roleDisplayName(
  code: string | undefined | null,
  t: Translate,
  catalogue?: { code: string; name: string }[],
): string {
  if (!code) return '—';
  const key = FALLBACK_KEYS[code as keyof typeof FALLBACK_KEYS];
  if (key) return t(key);
  const fromCat = catalogue?.find((r) => r.code === code)?.name;
  if (fromCat && fromCat !== code) return fromCat;
  return code.replace(/_/g, ' ');
}

/** Initials for the avatar placeholder (first letters of up to two words). */
export function userInitials(fullName: string | undefined | null): string {
  const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0].slice(0, 1) + parts[parts.length - 1].slice(0, 1)).toUpperCase();
}
