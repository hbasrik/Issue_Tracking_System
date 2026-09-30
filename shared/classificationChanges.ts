import type { MessageKey, Translate } from './i18n/translate';

/** One resolved field change of an ISSUE_CLASSIFICATION_CHANGE audit row. */
export type ClassificationChange = {
  Field: string;
  FromTR: string;
  FromEN: string;
  ToTR: string;
  ToEN: string;
};

const FIELD_LABEL_KEYS: Record<string, MessageKey> = {
  part: 'issue.defectPart',
  type: 'issue.defectType',
  custom_part: 'report.customPartName',
  custom_defect: 'report.customDefectName',
  code: 'issue.defectCode',
};

function side(tr: string, en: string, locale: string, t: Translate): string {
  const a = (tr ?? '').trim();
  const b = (en ?? '').trim();
  return (locale === 'en' ? b || a : a || b) || t('common.emDash');
}

/**
 * "Parça: Doghouse → Kapı" lines for a classification correction. Unknown
 * fields (e.g. the hidden responsible process) are skipped; no changes →
 * a single "saved without changes" line.
 */
export function classificationChangeLines(
  changes: ClassificationChange[] | null | undefined,
  t: Translate,
  locale: string,
): string[] {
  const lines = (changes ?? [])
    .filter((c) => FIELD_LABEL_KEYS[c.Field])
    .map(
      (c) =>
        `${t(FIELD_LABEL_KEYS[c.Field])}: ${side(c.FromTR, c.FromEN, locale, t)} → ${side(c.ToTR, c.ToEN, locale, t)}`,
    );
  return lines.length > 0 ? lines : [t('classificationChange.none')];
}
