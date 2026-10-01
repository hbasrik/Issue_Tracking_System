/**
 * Recognises a queued issue report that can no longer be sent because its
 * part or defect type left the catalogue after it was queued, so the queue
 * screen can ask for a new classification instead of a dead "failed" row.
 */

/** Backend sentinels returned when a selected catalogue row is not selectable. */
const CATALOG_REJECTIONS = new Set([
  'selected catalogue item is inactive',
  "selected part's zone is inactive",
]);

export type CatalogRejection = 'part' | 'type' | 'both' | 'unknown';

export interface QueuedClassification {
  status: string;
  issueId?: number;
  lastErrorCode?: string;
  lastError?: string;
  payload: { defect_part_id: number; defect_type_id: number };
}

export interface SelectableCatalog {
  /** False until a catalogue snapshot exists; nothing is judged before that. */
  loaded: boolean;
  partIds: ReadonlySet<number>;
  typeIds: ReadonlySet<number>;
}

export function isCatalogRejectionMessage(message?: string): boolean {
  return CATALOG_REJECTIONS.has((message ?? '').trim());
}

/**
 * Which classification field must be re-chosen, or null when the item is not
 * blocked by the catalogue. Once the issue exists on the server (only the
 * photo is pending) the classification is no longer editable here.
 */
export function catalogRejection(
  item: QueuedClassification,
  catalog: SelectableCatalog,
): CatalogRejection | null {
  if (item.issueId != null || item.status === 'sending') return null;
  const partGone = catalog.loaded && !catalog.partIds.has(item.payload.defect_part_id);
  const typeGone = catalog.loaded && !catalog.typeIds.has(item.payload.defect_type_id);
  if (partGone && typeGone) return 'both';
  if (partGone) return 'part';
  if (typeGone) return 'type';
  const serverSaid =
    item.lastErrorCode === 'http' && isCatalogRejectionMessage(item.lastError);
  if (!serverSaid) return null;
  return item.lastError === "selected part's zone is inactive" ? 'part' : 'unknown';
}
