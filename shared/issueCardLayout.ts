/**
 * Issue card layout + open-duration formatting — single source for web & mobile.
 * Do not redefine these constants in platform code.
 */

/** Minimum card width (px) when computing grid columns. */
export const ISSUE_CARD_MIN_WIDTH_PX = 280;

/** Hard cap on grid columns (TV / ultra-wide). */
export const ISSUE_CARD_MAX_COLUMNS = 4;

/**
 * Below this viewport/container width (px) the card uses the compact
 * list layout (photo left). At or above: grid layout (photo on top).
 */
export const ISSUE_CARD_COMPACT_MAX_PX = 600;

/** Photo frame aspect ratio (width / height). */
export const ISSUE_CARD_PHOTO_ASPECT = 4 / 3;

/** i18n message keys for severity labels — both apps must use these. */
export const SEVERITY_MESSAGE_KEYS = {
  CRITICAL: 'severity.critical',
  MEDIUM: 'severity.medium',
  LOW: 'severity.low',
} as const;

export type SeverityCode = keyof typeof SEVERITY_MESSAGE_KEYS;

export function severityMessageKey(
  severity: string,
): (typeof SEVERITY_MESSAGE_KEYS)[SeverityCode] | null {
  const v = severity.toUpperCase();
  if (v === 'CRITICAL' || v === 'MEDIUM' || v === 'LOW') {
    return SEVERITY_MESSAGE_KEYS[v];
  }
  return null;
}

/**
 * Business report timestamp for sorting and open-duration.
 * Prefer IssueDate (issue_list.issue_date — indexed day analytics, set at
 * create). CreatedAt is the row audit stamp; they usually match but IssueDate
 * is the field that means "when the defect was reported".
 */
export function issueReportedAtIso(issue: {
  IssueDate?: string | null;
  CreatedAt?: string | null;
}): string | null {
  const primary = (issue.IssueDate ?? '').trim();
  if (primary && !primary.startsWith('0001')) return primary;
  const fallback = (issue.CreatedAt ?? '').trim();
  if (fallback && !fallback.startsWith('0001')) return fallback;
  return null;
}

export function issueOpenDurationMs(
  issue: {
    IssueDate?: string | null;
    CreatedAt?: string | null;
    Status?: string | null;
    ApproveDate?: string | null;
    ConditionalApproveDate?: string | null;
  },
  nowMs: number = Date.now(),
): number {
  const startIso = issueReportedAtIso(issue);
  if (!startIso) return 0;
  const start = Date.parse(startIso);
  if (!Number.isFinite(start)) return 0;

  let end = nowMs;
  const status = (issue.Status ?? '').toUpperCase();
  if (status === 'APPROVED' && issue.ApproveDate) {
    const t = Date.parse(issue.ApproveDate);
    if (Number.isFinite(t)) end = t;
  } else if (status === 'CONDITIONAL_APPROVED' && issue.ConditionalApproveDate) {
    const t = Date.parse(issue.ConditionalApproveDate);
    if (Number.isFinite(t)) end = t;
  }
  return Math.max(0, end - start);
}

/**
 * Compact duration: "3g 2s" / "6s" / "12dk" (tr) or "3d 2h" / "6h" / "12m" (en).
 */
export function formatIssueOpenDuration(
  ms: number,
  locale: string,
): string {
  const en = locale === 'en' || locale.toLowerCase().startsWith('en');
  const totalMin = Math.floor(ms / 60_000);
  if (totalMin < 1) return en ? '<1m' : '<1dk';

  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const mins = totalMin % 60;

  if (days > 0) {
    return en ? `${days}d ${hours}h` : `${days}g ${hours}s`;
  }
  if (hours > 0) {
    return en ? `${hours}h` : `${hours}s`;
  }
  return en ? `${mins}m` : `${mins}dk`;
}

/** Grid column count from available width (not a CSS breakpoint table). */
export function issueCardColumnCount(widthPx: number): number {
  if (widthPx < ISSUE_CARD_COMPACT_MAX_PX) return 1;
  const raw = Math.floor(widthPx / ISSUE_CARD_MIN_WIDTH_PX);
  return Math.min(ISSUE_CARD_MAX_COLUMNS, Math.max(1, raw));
}

export function issueCardIsCompact(widthPx: number): boolean {
  return widthPx < ISSUE_CARD_COMPACT_MAX_PX;
}
