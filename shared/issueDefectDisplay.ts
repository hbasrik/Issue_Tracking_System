import type { Translate } from './i18n/translate';

/** Issue fields needed to render defect classification (API join shape). */
export type DefectIssueFields = {
  DefectPartID?: number | null;
  DefectTypeID?: number | null;
  DefectZoneID?: number | null;
  DefectCode?: string | null;
  CustomPartName?: string | null;
  CustomDefectName?: string | null;
  DefectPartNameTR?: string | null;
  DefectPartNameEN?: string | null;
  DefectTypeNameTR?: string | null;
  DefectTypeNameEN?: string | null;
  DefectZoneNameTR?: string | null;
  DefectZoneNameEN?: string | null;
  DefectProcessNameTR?: string | null;
  DefectProcessNameEN?: string | null;
};

export type DefectDisplay = {
  classified: boolean;
  zone: string;
  part: string;
  type: string;
  process: string;
  code: string;
  /** Compact list line: "Kapı · Boşluk / hizasızlık" or unclassified. */
  listLine: string;
};

function pickLocale(
  tr: string | null | undefined,
  en: string | null | undefined,
  locale: string,
): string {
  const a = (tr ?? '').trim();
  const b = (en ?? '').trim();
  if (locale === 'en') return b || a;
  return a || b;
}

/**
 * Labels for detail / list / export. Empty classification → "Sınıflandırılmamış"
 * on every field (no blank rows). Custom names win for Diğer part/type.
 */
export function issueDefectDisplay(
  issue: DefectIssueFields,
  t: Translate,
  locale: string,
): DefectDisplay {
  const unclassified = t('issue.unclassified');
  const classified =
    issue.DefectPartID != null ||
    issue.DefectTypeID != null ||
    Boolean((issue.DefectCode ?? '').trim());

  if (!classified) {
    return {
      classified: false,
      zone: unclassified,
      part: unclassified,
      type: unclassified,
      process: unclassified,
      code: unclassified,
      listLine: unclassified,
    };
  }

  const catalogPart = pickLocale(
    issue.DefectPartNameTR,
    issue.DefectPartNameEN,
    locale,
  );
  const catalogType = pickLocale(
    issue.DefectTypeNameTR,
    issue.DefectTypeNameEN,
    locale,
  );
  const part =
    (issue.CustomPartName ?? '').trim() || catalogPart || unclassified;
  const type =
    (issue.CustomDefectName ?? '').trim() || catalogType || unclassified;
  const zone =
    pickLocale(issue.DefectZoneNameTR, issue.DefectZoneNameEN, locale) ||
    unclassified;
  const process =
    pickLocale(issue.DefectProcessNameTR, issue.DefectProcessNameEN, locale) ||
    unclassified;
  const code = (issue.DefectCode ?? '').trim() || unclassified;

  return {
    classified: true,
    zone,
    part,
    type,
    process,
    code,
    listLine: `${part} · ${type}`,
  };
}
