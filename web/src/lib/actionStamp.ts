/** Shared “who · when” stamp under shop-floor actions. */

export function formatActionAt(iso?: string | null): string | null {
  if (!iso || iso.startsWith('0001')) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function formatActionStamp(
  name: string | undefined,
  iso?: string | null,
): string | null {
  const when = formatActionAt(iso);
  if (!when) return null;
  const who = name?.trim() ? name.trim() : '—';
  return `${who} · ${when}`;
}

export type ChecklistActorFields = {
  Status: string;
  CheckerName?: string;
  CheckDate?: string | null;
  RejectedByName?: string;
  RejectedAt?: string | null;
  ApprovedByName?: string;
  ApprovedAt?: string | null;
};

/** Checker first; extra reject/approve lines only when they differ. */
export function checklistActorLines(item: ChecklistActorFields): string[] {
  if (item.Status === 'PENDING') return [];
  const lines: string[] = [];
  const checker = formatActionStamp(item.CheckerName, item.CheckDate);
  if (checker) lines.push(checker);
  const rejected = formatActionStamp(item.RejectedByName, item.RejectedAt);
  if (rejected && rejected !== checker) {
    lines.push(`Red · ${rejected}`);
  }
  const approved = formatActionStamp(item.ApprovedByName, item.ApprovedAt);
  if (approved && approved !== checker) {
    lines.push(`Onay · ${approved}`);
  }
  return lines;
}
