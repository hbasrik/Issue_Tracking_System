import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SeverityLevel } from '../components/SeverityIndicator';

const BOARD_UI_KEY = 'karea-issues-board-ui';

export type IssuesBoardUIState = {
  listQuery: string;
  typeIds: number[];
  defectZoneIds: number[];
  defectPartIds: number[];
  defectTypeIds: number[];
  severities: SeverityLevel[];
  /** Explicitly present (including []) means user choice; missing key → defaults. */
  statuses?: string[];
  advancedOpen: boolean;
  scrollTop: number;
};

export async function readIssuesBoardUI(): Promise<IssuesBoardUIState | null> {
  try {
    const raw = await AsyncStorage.getItem(BOARD_UI_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as IssuesBoardUIState;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function writeIssuesBoardUI(
  state: IssuesBoardUIState,
): Promise<void> {
  try {
    await AsyncStorage.setItem(BOARD_UI_KEY, JSON.stringify(state));
  } catch {
    // quota / private mode — ignore
  }
}
