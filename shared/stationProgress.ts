/**
 * Station-level progress for the vehicle station list — single rule for web
 * and mobile. Derived from the station's steps; nothing is stored.
 */

export type StationProgress = 'DONE' | 'IN_PROGRESS' | 'NOT_STARTED';

export const STATION_PROGRESS_MESSAGE_KEYS = {
  DONE: 'status.station.done',
  IN_PROGRESS: 'status.station.inProgress',
  NOT_STARTED: 'status.station.notStarted',
} as const;

/**
 * DONE — every step OK. IN_PROGRESS — the vehicle's current station, or any
 * step already checked (OK or NOT_OK). NOT_STARTED — nothing checked yet.
 */
export function stationProgress(
  steps: readonly { Status: string }[],
  isCurrent: boolean,
): StationProgress {
  if (steps.length > 0 && steps.every((s) => s.Status === 'OK')) return 'DONE';
  if (isCurrent || steps.some((s) => s.Status !== 'PENDING')) return 'IN_PROGRESS';
  return 'NOT_STARTED';
}
