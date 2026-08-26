import { Image, View } from 'react-native';
import { sidebarTokens, space } from '../theme/tokens';

/** Intrinsic pixel size of `assets/logo.png` — display smaller for sharp DPI. */
const SRC_W = 422;
const SRC_H = 362;
const SRC = require('../../assets/logo.png');

/**
 * Brand mark. Orange glyph on orange chrome is unreadable, so the asset
 * sits on a white plate — do not recolor or crop the file.
 */
export function Logo({ height = 40 }: { height?: number }) {
  const width = Math.round((height * SRC_W) / SRC_H);
  return (
    <View
      style={{
        backgroundColor: sidebarTokens.text,
        borderRadius: 8,
        padding: space[2],
        alignSelf: 'flex-start',
      }}
    >
      <Image
        source={SRC}
        style={{ width, height }}
        resizeMode="contain"
        accessibilityLabel="Karea"
      />
    </View>
  );
}
