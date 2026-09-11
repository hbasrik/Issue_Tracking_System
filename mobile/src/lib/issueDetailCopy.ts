import type { Issue } from '../api/client';
import {
  issueDefectDisplay,
  type DefectDisplay,
} from '../../../shared/issueDefectDisplay';
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

export function defectLabels(
  issue: Issue,
  t: Translate,
  locale: string,
): DefectDisplay {
  return issueDefectDisplay(issue, t, locale);
}
