import { sidebarTokens, space } from '../theme/tokens';

/** Intrinsic pixel size of `public/logo.png` — display smaller for sharp DPI. */
const SRC_W = 422;
const SRC_H = 362;
const SRC = '/logo.png';

/**
 * Brand mark. Orange glyph on orange chrome is unreadable, so the asset
 * sits on a white plate — do not recolor or crop the file.
 */
export function Logo({
  height = 40,
  alt = 'Karea',
}: {
  height?: number;
  alt?: string;
}) {
  const width = Math.round((height * SRC_W) / SRC_H);
  return (
    <div
      className="inline-flex items-center justify-center rounded-lg"
      style={{
        backgroundColor: sidebarTokens.text,
        padding: space[2],
      }}
    >
      <img
        src={SRC}
        alt={alt}
        width={width}
        height={height}
        className="block object-contain"
        style={{ width, height }}
        decoding="async"
      />
    </div>
  );
}
