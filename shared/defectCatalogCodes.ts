/**
 * Client mirror of the catalogue code and name rules (docs/11 Karar 20) so
 * the admin form can suggest a code and warn before saving. The backend
 * enforces the same rules and has the final say.
 */

const RESERVED_OTHER_SUFFIX = '99';

function twoDigits(n: number): string {
  return String(n).padStart(2, '0');
}

function isTwoDigitCode(s: string): boolean {
  return /^\d{2}$/.test(s) && s !== '00';
}

/**
 * Next free number from the codes' two-digit suffixes: highest + 1, skipping
 * taken values and 99 (kept for "Other"); falls back to the first gap.
 */
function nextFree(suffixes: string[]): string | null {
  const taken = new Set(suffixes.filter(isTwoDigitCode).map(Number));
  const regular = [...taken].filter((n) => twoDigits(n) !== RESERVED_OTHER_SUFFIX);
  let candidate = (regular.length ? Math.max(...regular) : 0) + 1;
  while (taken.has(candidate)) candidate += 1;
  if (candidate <= 98) return twoDigits(candidate);
  for (let n = 1; n <= 98; n += 1) {
    if (!taken.has(n)) return twoDigits(n);
  }
  return null;
}

/** Suggested code for a new part in the zone, e.g. "10-04" after 10-03. */
export function nextPartCode(zoneCode: string, existingCodes: string[]): string | null {
  const zone = zoneCode.trim();
  if (!zone) return null;
  const prefix = `${zone}-`;
  const suffixes = existingCodes
    .map((c) => c.trim())
    .filter((c) => c.startsWith(prefix))
    .map((c) => c.slice(prefix.length));
  const next = nextFree(suffixes);
  return next ? `${prefix}${next}` : null;
}

/** Suggested code for a new defect type, e.g. "10" after 01–09 and 99. */
export function nextTypeCode(existingCodes: string[]): string | null {
  return nextFree(existingCodes.map((c) => c.trim()));
}

/** True when the part code is "<zone code>-NN" (NN = 01–99). */
export function isValidPartCode(zoneCode: string, code: string): boolean {
  const zone = zoneCode.trim();
  const value = code.trim();
  const prefix = `${zone}-`;
  return zone !== '' && value.startsWith(prefix) && isTwoDigitCode(value.slice(prefix.length));
}

/** True when the defect type code is two digits (01–99). */
export function isValidTypeCode(code: string): boolean {
  return isTwoDigitCode(code.trim());
}

/**
 * Same entry for a person: case, surrounding and repeated spaces ignored;
 * dotted and dotless i fold together (KAPI = kapı, HINGE = hinge).
 */
export function sameCatalogueName(a: string, b: string): boolean {
  return normalizeCatalogueName(a) === normalizeCatalogueName(b);
}

function normalizeCatalogueName(s: string): string {
  return s.trim().split(/\s+/).join(' ').replace(/[Iİ]/g, 'i').toLowerCase().replace(/ı/g, 'i');
}
