import { Image } from 'react-native';

/** Intrinsic pixel size of `assets/logo.png` — display smaller for sharp DPI. */
const SRC_W = 422;
const SRC_H = 362;
const SRC = require('../../assets/logo.png');

/** Brand mark — render the asset as-is, no plate or recolor. */
export function Logo({ height = 40 }: { height?: number }) {
  const width = Math.round((height * SRC_W) / SRC_H);
  return (
    <Image
      source={SRC}
      style={{ width, height, alignSelf: 'flex-start' }}
      resizeMode="contain"
      accessibilityLabel="Karea"
    />
  );
}
