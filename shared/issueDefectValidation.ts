/**
 * Defect classification *input* rules — single source of truth for web and
 * mobile. Display labels stay in issueDefectDisplay.ts; this file is the
 * gate that must agree on both clients when a rule changes.
 *
 * Catalogue "Other" rows are identified by stable seed codes (not names):
 *   part 99-99, type 99.
 */
import type { MessageKey } from './i18n';

export const OTHER_PART_CODE = '99-99';
export const OTHER_TYPE_CODE = '99';

export type DefectCatalogPartRef = { ID: number; Code: string };
export type DefectCatalogTypeRef = { ID: number; Code: string };

export type DefectClassificationInput = {
  zoneId: number | null;
  partId: number | null;
  typeId: number | null;
  customPartName: string;
  customDefectName: string;
};

export function isOtherPartCode(code: string | null | undefined): boolean {
  return code === OTHER_PART_CODE;
}

export function isOtherTypeCode(code: string | null | undefined): boolean {
  return code === OTHER_TYPE_CODE;
}

/**
 * Returns the i18n key for the first failed rule, or null when the payload
 * is complete. Callers must `t(key)` so both platforms show the same copy.
 */
export function validateDefectClassification(
  input: DefectClassificationInput,
  parts: DefectCatalogPartRef[],
  types: DefectCatalogTypeRef[],
): MessageKey | null {
  if (input.zoneId == null) return 'report.zoneRequired';
  if (input.partId == null) return 'report.partRequired';
  if (input.typeId == null) return 'report.defectTypeRequired';
  const part = parts.find((p) => p.ID === input.partId);
  const type = types.find((ty) => ty.ID === input.typeId);
  if (isOtherPartCode(part?.Code) && !input.customPartName.trim()) {
    return 'report.customPartRequired';
  }
  if (isOtherTypeCode(type?.Code) && !input.customDefectName.trim()) {
    return 'report.customDefectRequired';
  }
  return null;
}

export function isDefectClassificationComplete(
  input: DefectClassificationInput,
  parts: DefectCatalogPartRef[],
  types: DefectCatalogTypeRef[],
): boolean {
  return validateDefectClassification(input, parts, types) == null;
}
