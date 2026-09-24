/**
 * Contrast self-check for shared surface tokens (card edge vs page/fill).
 */
import {
  contrastRatio,
  darkSurfaces,
  lightSurfaces,
  mixTowardWhite,
  lightInk,
} from './surfaces.ts';

const oldLightBorder = mixTowardWhite(lightInk, 72);

const lightBorderOnCard = contrastRatio(lightSurfaces.border, lightSurfaces.bgSurface1);
const lightBorderOnPage = contrastRatio(lightSurfaces.border, lightSurfaces.bgPage);
const oldBorderOnCard = contrastRatio(oldLightBorder, lightSurfaces.bgSurface1);
const darkBorderOnCard = contrastRatio(darkSurfaces.border, darkSurfaces.bgSurface1);
const darkBorderOnPage = contrastRatio(darkSurfaces.border, darkSurfaces.bgPage);
const cardOnPage = contrastRatio(lightSurfaces.bgSurface1, lightSurfaces.bgPage);

if (lightBorderOnCard <= oldBorderOnCard) {
  throw new Error(
    `light border must beat old 72% mix: now ${lightBorderOnCard.toFixed(2)} vs old ${oldBorderOnCard.toFixed(2)}`,
  );
}
if (lightBorderOnCard < 2.5) {
  throw new Error(`light card border contrast too low: ${lightBorderOnCard.toFixed(2)}`);
}
if (darkBorderOnCard < 1.4) {
  throw new Error(`dark card border contrast too low: ${darkBorderOnCard.toFixed(2)}`);
}

console.log(
  JSON.stringify(
    {
      light: {
        border_on_card: Number(lightBorderOnCard.toFixed(2)),
        border_on_page: Number(lightBorderOnPage.toFixed(2)),
        card_on_page: Number(cardOnPage.toFixed(2)),
        old_border_on_card: Number(oldBorderOnCard.toFixed(2)),
        border: lightSurfaces.border,
        bgPage: lightSurfaces.bgPage,
        bgSurface1: lightSurfaces.bgSurface1,
      },
      dark: {
        border_on_card: Number(darkBorderOnCard.toFixed(2)),
        border_on_page: Number(darkBorderOnPage.toFixed(2)),
        border: darkSurfaces.border,
      },
    },
    null,
    2,
  ),
);
console.log('shared/surfaces.ts ok');
