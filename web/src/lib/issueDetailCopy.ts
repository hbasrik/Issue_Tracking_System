import type { Issue } from './api';
import type { Translate } from '../../../shared/i18n';

export function issueStationLabel(issue: {
  StationName?: string;
  StationID?: number | null;
}): string {
  if (issue.StationName) return issue.StationName;
  if (issue.StationID != null) return String(issue.StationID);
  return '—';
}

export function reporterFallback(t: Translate, id: number | undefined): string {
  return t('common.userFallback', { id: id ?? 0 });
}

/** Part / type / code display; empty classification → neutral unclassified. */
export function issueDefectSummary(
  issue: Issue,
  t: Translate,
  locale: 'tr' | 'en',
): { part: string; type: string; code: string } {
  const unclassified = t('issue.unclassified');
  if (issue.DefectPartID == null && !issue.DefectCode) {
    return { part: unclassified, type: unclassified, code: unclassified };
  }
  const partName =
    locale === 'en'
      ? issue.DefectPartNameEN || issue.DefectPartNameTR
      : issue.DefectPartNameTR || issue.DefectPartNameEN;
  const typeName =
    locale === 'en'
      ? issue.DefectTypeNameEN || issue.DefectTypeNameTR
      : issue.DefectTypeNameTR || issue.DefectTypeNameEN;
  const part =
    issue.CustomPartName?.trim() ||
    partName ||
    unclassified;
  const type =
    issue.CustomDefectName?.trim() ||
    typeName ||
    unclassified;
  return {
    part,
    type,
    code: issue.DefectCode?.trim() || unclassified,
  };
}
