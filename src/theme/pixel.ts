/**
 * Pixel-art design tokens.
 * Palette: black, blue (#2f6bff / #4d8dff) and coral (#FF6B4A).
 *
 * Fonts (both free, SIL Open Font License, via Google Fonts):
 *  - Press Start 2P — chunky 8-bit display font for titles, numbers, judgments
 *  - VT323 — readable terminal-style pixel font for body text
 */

export const FONTS = {
  /** Display / headings / numbers. */
  pixel: 'PressStart2P_400Regular',
  /** Body text. */
  body: 'VT323_400Regular',
} as const;

/** Tile colours: blue on black, the same for every lane. */
export const LANE_COLORS = ['#2f6bff', '#2f6bff', '#2f6bff', '#2f6bff'] as const;

/** Lighter / darker shades for the bevelled pixel tiles. */
export const LANE_LIGHT = ['#6f9bff', '#6f9bff', '#6f9bff', '#6f9bff'] as const;
export const LANE_DARK = ['#123a9e', '#123a9e', '#123a9e', '#123a9e'] as const;

export const PIXEL = {
  /** Size of one "pixel" in the art (bevels, particles, borders). */
  unit: 4,
  bg: '#05070d',
  panel: '#0b1220',
  panelLight: '#15203a',
  outline: '#000000',
  accent: '#FF6B4A',
  accent2: '#4d8dff',
  gold: '#FF6B4A',
  text: '#e6ecf7',
  textDim: '#9aa7c2',
} as const;

/** Hard, offset "pixel" drop shadow for text. */
export const pixelTextShadow = (color: string = PIXEL.outline) => ({
  textShadowColor: color,
  textShadowOffset: { width: 2, height: 2 },
  textShadowRadius: 0.1,
});
