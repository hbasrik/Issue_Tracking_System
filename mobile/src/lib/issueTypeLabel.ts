/** Short chip label for issue_types rows (Hata / Tamir Gerekiyor). */
export function issueTypeChipLabel(name: string): string {
  if (/^tamir/i.test(name.trim())) return 'Tamir';
  return name;
}
