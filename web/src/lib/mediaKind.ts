/** True when Chrome/Firefox will not render this image (HEIC/HEIF). */
export function isNonWebImage(
  mime?: string | null,
  fileName?: string | null,
  storagePath?: string | null,
): boolean {
  const mimeL = (mime ?? '').toLowerCase();
  if (mimeL.includes('heic') || mimeL.includes('heif')) return true;
  return heicExt(fileName) || heicExt(storagePath);
}

function heicExt(name?: string | null): boolean {
  const n = (name ?? '').toLowerCase();
  return n.endsWith('.heic') || n.endsWith('.heif') || n.endsWith('.hif');
}
