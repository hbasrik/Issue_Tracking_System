/** Intrinsic pixel size of `public/logo.png` — display smaller for sharp DPI. */
const SRC_W = 422;
const SRC_H = 362;
const SRC = '/logo.png';

/** Brand mark — render the asset as-is, no plate or recolor. */
export function Logo({
  height = 40,
  alt = 'Karea',
}: {
  height?: number;
  alt?: string;
}) {
  const width = Math.round((height * SRC_W) / SRC_H);
  return (
    <img
      src={SRC}
      alt={alt}
      width={width}
      height={height}
      className="block object-contain"
      style={{ width, height }}
      decoding="async"
    />
  );
}
