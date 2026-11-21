/**
 * Pixel-art design tokens.
 * Colours come from the active palette (src/theme/palette.ts).
 *
 * Fonts (both free, SIL Open Font License, via Google Fonts):
 *  - Press Start 2P — chunky 8-bit display font for titles, numbers, judgments
 *  - VT323 — readable terminal-style pixel font for body text
 */

import { C } from './palette';

export const FONTS = {
  /** Display / headings / numbers. */
  pixel: 'PressStart2P_400Regular',
  /** Body text. */
  body: 'VT323_400Regular',
} as const;

/** Tile colours: blue on black, the same for every lane. */
export const LANE_COLORS = [C.blueStrong, C.blueStrong, C.blueStrong, C.blueStrong] as const;

/** Lighter / darker shades for the bevelled pixel tiles. */
export const LANE_LIGHT = [C.blueLight, C.blueLight, C.blueLight, C.blueLight] as const;
export const LANE_DARK = [C.blueDark, C.blueDark, C.blueDark, C.blueDark] as const;

export const PIXEL = {
  /** Size of one "pixel" in the art (bevels, particles, borders). */
  unit: 4,
  bg: C.bg,
  panel: C.panel,
  panelLight: C.panelLight,
  outline: C.outline,
  accent: C.accent,
  accent2: C.blue,
  gold: C.accent,
  text: C.text,
  textDim: C.textDim,
} as const;

/** Hard, offset "pixel" drop shadow for text. */
export const pixelTextShadow = (color: string = PIXEL.outline) => ({
  textShadowColor: color,
  textShadowOffset: { width: 2, height: 2 },
  textShadowRadius: 0.1,
});
