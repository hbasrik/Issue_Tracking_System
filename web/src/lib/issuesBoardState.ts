import type { SeverityLevel } from '../components/SeverityIndicator';

const BOARD_UI_KEY = 'karea-issues-board-ui-v2';

export type IssuesBoardUIState = {
  listQuery: string;
  typeIds: number[];
  defectZoneIds: number[];
  defectPartIds: number[];
  defectTypeIds: number[];
  severities: SeverityLevel[];
  statuses: string[];
  advancedOpen: boolean;
  scrollTop: number;
};

export function readIssuesBoardUI(): IssuesBoardUIState | null {
  try {
    const raw = sessionStorage.getItem(BOARD_UI_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as IssuesBoardUIState;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeIssuesBoardUI(state: IssuesBoardUIState): void {
  try {
    sessionStorage.setItem(BOARD_UI_KEY, JSON.stringify(state));
  } catch {
    // private mode / quota — ignore
  }
}

/** Merge only scrollTop into the saved board UI (flush before detail nav). */
export function patchBoardScrollTop(scrollTop: number): void {
  try {
    const raw = sessionStorage.getItem(BOARD_UI_KEY);
    const prev = raw ? (JSON.parse(raw) as Partial<IssuesBoardUIState>) : {};
    sessionStorage.setItem(
      BOARD_UI_KEY,
      JSON.stringify({ ...prev, scrollTop }),
    );
  } catch {
    /* */
  }
}

export function appScrollEl(): HTMLElement | null {
  return document.querySelector('[data-app-scroll]');
}

export function readAppScrollTop(): number {
  return appScrollEl()?.scrollTop ?? 0;
}

export function restoreAppScrollTop(top: number): void {
  const el = appScrollEl();
  if (!el) return;
  requestAnimationFrame(() => {
    el.scrollTop = top;
  });
}
