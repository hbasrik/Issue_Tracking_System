/** Readable role names — never show the raw catalogue code in chrome. */
const FALLBACK: Record<string, string> = {
  MANAGER_ADMIN: 'Yönetici/Admin',
  OPERATOR: 'Operatör',
  QUALITY: 'Kalite',
  ASSEMBLY: 'Montaj',
};

export function roleDisplayName(
  code: string | undefined | null,
  catalogue?: { code: string; name: string }[],
): string {
  if (!code) return '—';
  if (FALLBACK[code]) return FALLBACK[code];
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
