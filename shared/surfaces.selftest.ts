/**
 * Contrast self-check for shared surface tokens (card edge vs page/fill).
 * UI component boundaries must meet WCAG 3:1 against adjacent surfaces.
 */
import {
  contrastRatio,
  darkSurfaces,
  lightSurfaces,
  mixTowardWhite,
  lightInk,
} from './surfaces.ts';

const MIN_UI = 3;

const prevLightBorder = mixTowardWhite(lightInk, 58);
const prevDarkBorder = mixTowardWhite('#26313C', 22);

const light = {
  border_on_card: contrastRatio(lightSurfaces.border, lightSurfaces.bgSurface1),
  border_on_page: contrastRatio(lightSurfaces.border, lightSurfaces.bgPage),
  before_on_card: contrastRatio(prevLightBorder, lightSurfaces.bgSurface1),
  before_on_page: contrastRatio(prevLightBorder, lightSurfaces.bgPage),
  border: lightSurfaces.border,
};

const dark = {
  border_on_card: contrastRatio(darkSurfaces.border, darkSurfaces.bgSurface1),
  border_on_page: contrastRatio(darkSurfaces.border, darkSurfaces.bgPage),
  before_on_card: contrastRatio(prevDarkBorder, darkSurfaces.bgSurface1),
  before_on_page: contrastRatio(prevDarkBorder, darkSurfaces.bgPage),
  border: darkSurfaces.border,
};

for (const [name, ratio] of [
  ['light border_on_card', light.border_on_card],
  ['light border_on_page', light.border_on_page],
  ['dark border_on_card', dark.border_on_card],
  ['dark border_on_page', dark.border_on_page],
] as const) {
  if (ratio < MIN_UI) {
    throw new Error(`${name} ${ratio.toFixed(2)} < ${MIN_UI}`);
  }
}

if (light.border_on_card <= light.before_on_card) {
  throw new Error('light border must improve on previous 58% mix');
}
if (dark.border_on_card <= dark.before_on_card) {
  throw new Error('dark border must improve on previous 22% mix');
}

const report = {
  min_required: MIN_UI,
  light: {
    before: {
      border_on_card: Number(light.before_on_card.toFixed(2)),
      border_on_page: Number(light.before_on_page.toFixed(2)),
    },
    after: {
      border_on_card: Number(light.border_on_card.toFixed(2)),
      border_on_page: Number(light.border_on_page.toFixed(2)),
      border: light.border,
    },
  },
  dark: {
    before: {
      border_on_card: Number(dark.before_on_card.toFixed(2)),
      border_on_page: Number(dark.before_on_page.toFixed(2)),
    },
    after: {
      border_on_card: Number(dark.border_on_card.toFixed(2)),
      border_on_page: Number(dark.border_on_page.toFixed(2)),
      border: dark.border,
    },
  },
};

console.log(JSON.stringify(report, null, 2));
console.log('shared/surfaces.ts ok');
