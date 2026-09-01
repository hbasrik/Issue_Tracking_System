import type { Translate } from '../../../shared/i18n';

const FALLBACK_KEYS = {
  MANAGER_ADMIN: 'role.MANAGER_ADMIN',
  OPERATOR: 'role.OPERATOR',
  QUALITY: 'role.QUALITY',
  ASSEMBLY: 'role.ASSEMBLY',
} as const;

export function roleDisplayName(
  code: string | undefined | null,
  t: Translate,
): string {
  if (!code) return '—';
  const key = FALLBACK_KEYS[code as keyof typeof FALLBACK_KEYS];
  if (key) return t(key);
  return code.replace(/_/g, ' ');
}
