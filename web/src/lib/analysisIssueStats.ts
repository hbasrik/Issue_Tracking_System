import type { Issue } from './api';

/** Analysis KPI card drill-down on the Issues list. */
export type AnalysisIssueStatKey = 'open_active' | 'completed';

export const ANALYSIS_ISSUE_STAT_LABELS: Record<AnalysisIssueStatKey, string> = {
  open_active: 'Açık hatalar',
  completed: 'Biten işler',
};

export function isAnalysisIssueStatKey(
  value: string | null,
): value is AnalysisIssueStatKey {
  return value === 'open_active' || value === 'completed';
}

function issueCalendarDay(issue: Issue): string | null {
  const raw = issue.IssueDate || issue.CreatedAt;
  if (!raw) return null;
  return raw.slice(0, 10);
}

function inInclusiveRange(day: string | null, from?: string, to?: string): boolean {
  if (!from && !to) return true;
  if (!day) return false;
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

export function matchesAnalysisIssueStat(
  issue: Issue,
  key: AnalysisIssueStatKey,
  from?: string,
  to?: string,
): boolean {
  if (!inInclusiveRange(issueCalendarDay(issue), from, to)) {
    return false;
  }
  if (key === 'open_active') {
    return issue.Status === 'OPEN' || issue.Status === 'IN_PROGRESS';
  }
  return (
    issue.Status === 'DONE' ||
    issue.Status === 'APPROVED' ||
    issue.Status === 'CONDITIONAL_APPROVED'
  );
}
