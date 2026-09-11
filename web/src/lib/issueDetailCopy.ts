import type { Issue } from './api';
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

/** @deprecated Prefer issueDefectDisplay — kept for call-site compatibility. */
export function issueDefectSummary(
  issue: Issue,
  t: Translate,
  locale: 'tr' | 'en',
): { part: string; type: string; code: string } {
  const d = issueDefectDisplay(issue, t, locale);
  return { part: d.part, type: d.type, code: d.code };
}

export function defectLabels(
  issue: Issue,
  t: Translate,
  locale: string,
): DefectDisplay {
  return issueDefectDisplay(issue, t, locale);
}
