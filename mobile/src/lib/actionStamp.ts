import type { Locale, Translate } from '../../../shared/i18n';
import { formatActionAt as formatActionAtLocale } from '../../../shared/i18n';

export function formatActionAt(
  iso?: string | null,
  locale: Locale = 'tr',
): string | null {
  return formatActionAtLocale(iso, locale);
}

export function formatActionStamp(
  name: string | undefined,
  iso?: string | null,
  locale: Locale = 'tr',
): string | null {
  const when = formatActionAt(iso, locale);
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

export function checklistActorLines(
  item: ChecklistActorFields,
  t: Translate,
  locale: Locale,
): string[] {
  if (item.Status === 'PENDING') return [];
  const lines: string[] = [];
  const checker = formatActionStamp(item.CheckerName, item.CheckDate, locale);
  if (checker) lines.push(checker);
  if (item.Status === 'NOT_OK') {
    const rejected = formatActionStamp(
      item.RejectedByName,
      item.RejectedAt,
      locale,
    );
    if (rejected && rejected !== checker) {
      lines.push(`${t('stamp.reject')} · ${rejected}`);
    }
    return lines;
  }
  if (item.Status === 'OK' || item.Status === 'CONDITIONAL_OK') {
    const approved = formatActionStamp(
      item.ApprovedByName,
      item.ApprovedAt,
      locale,
    );
    if (approved && approved !== checker) {
      lines.push(`${t('stamp.approve')} · ${approved}`);
    }
  }
  return lines;
}
