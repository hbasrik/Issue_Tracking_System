import type { DefectClassificationCoverage } from './api';

function pct(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;
}

/**
 * "Other" rates are measured against classified defects only: issues
 * opened before the catalogue could not pick "Other", so counting them
 * in the denominator would dilute the signal.
 */
export function defectCoverageRates(cov: DefectClassificationCoverage) {
  return {
    otherPartPct: pct(cov.OtherPart, cov.Classified),
    otherTypePct: pct(cov.OtherType, cov.Classified),
    legacyPct: pct(cov.Unclassified, cov.Total),
  };
}

export function formatPct(value: number | null, emDash: string): string {
  return value == null ? emDash : `${value}%`;
}
