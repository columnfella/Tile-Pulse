/**
 * COLOUR PALETTE: every colour the app's UI and play screen use.
 *
 * To re-colour the game (e.g. a light theme):
 *   1. Copy MIDNIGHT below into a new palette (e.g. `LIGHT`) and change the values.
 *   2. Add it to PALETTES and set ACTIVE_PALETTE to its id.
 * Every screen reads its colours from here (as `C.<name>`, or `alpha(C.<name>, 0.2)`
 * for see-through versions), so nothing else needs to change.
 *
 * Names describe the job of a colour, so a light palette can flip them:
 *  - surfaces:  bg (app background) → bgDeep (inputs, wells) → panel → card → panelLight
 *  - lines:     lineSoft (row separators) → line (input borders) → lineStrong
 *  - text:      textStrong (titles) → text → textSoft → textDim → textMuted → textFaint
 *  - outline / onAccent / black and white: the pixel-art outline, text on coral or
 *    green buttons, and pure black / white used in tile art and highlights.
 *    On a light palette you'd typically keep `white` and `onAccent` as they are and
 *    change `textStrong` to a dark colour.
 *
 * The palette is picked when the app starts (styles are built once). Switching it
 * from inside the app would need a restart of the JS bundle, e.g. a setting that
 * saves the id and reloads.
 *
 * Not part of the palette (fixed on purpose): the animated menu backgrounds
 * (their own themes, picked with the palette button), the default profile banner
 * colour, and ~35 one-off decorative shades (e.g. the bronze medal, a few badge
 * and level-card tints) that appear only once each.
 */

export interface Palette {
  id: string;
  name: string;

  /* surfaces (darkest → lightest on the dark palette) */
  bg: string;
  bgDeep: string;
  panel: string;
  card: string;
  panelLight: string;

  /* lines */
  lineSoft: string;
  line: string;
  lineStrong: string;

  /* text and icons */
  textStrong: string;
  text: string;
  textSoft: string;
  textDim: string;
  textMuted: string;
  textFaint: string;

  /* black / white roles */
  outline: string;
  onAccent: string;
  black: string;
  white: string;

  /* coral: the main accent */
  accent: string;
  accentLight: string;
  accentSoft: string;
  accentDark: string;
  accentDeep: string;

  /* blue: the second accent, and the tiles */
  blue: string;
  blueStrong: string;
  blueLight: string;
  bluePale: string;
  blueMist: string;
  blueSky: string;
  blueDark: string;
  blueDeeper: string;
  blueNight: string;
  blueAbyss: string;

  /* status */
  gold: string;
  warning: string;
  yellow: string;
  danger: string;
  dangerSoft: string;
  dangerDeep: string;
  success: string;
  successBright: string;
  successDeep: string;
  successDark: string;
}

/** The current look: black, blue and coral pixel art. */
export const MIDNIGHT: Palette = {
  id: 'midnight',
  name: 'Midnight',

  bg: '#05070d',
  bgDeep: '#070b14',
  panel: '#0b1220',
  card: '#0e1628',
  panelLight: '#15203a',

  lineSoft: '#111a2e',
  line: '#1f2e52',
  lineStrong: '#2a3654',

  textStrong: '#ffffff',
  text: '#e6ecf7',
  textSoft: '#cdd6ea',
  textDim: '#9aa7c2',
  textMuted: '#6b7a99',
  textFaint: '#3a4a70',

  outline: '#000000',
  onAccent: '#000000',
  black: '#000000',
  white: '#ffffff',

  accent: '#FF6B4A',
  accentLight: '#ff9a82',
  accentSoft: '#ffb39f',
  accentDark: '#d9502f',
  accentDeep: '#a83a22',

  blue: '#4d8dff',
  blueStrong: '#2f6bff',
  blueLight: '#6f9bff',
  bluePale: '#7aa4ff',
  blueMist: '#8fb8ff',
  blueSky: '#9cc0ff',
  blueDark: '#123a9e',
  blueDeeper: '#1a3d99',
  blueNight: '#0b1a33',
  blueAbyss: '#0a1f5c',

  gold: '#f5b83d',
  warning: '#ffb84d',
  yellow: '#ffd23f',
  danger: '#d8342f',
  dangerSoft: '#ff7a73',
  dangerDeep: '#7d1411',
  success: '#22c46e',
  successBright: '#7dff8a',
  successDeep: '#2f6b3a',
  successDark: '#0f7a43',
};

export const PALETTES = {
  midnight: MIDNIGHT,
} as const satisfies Record<string, Palette>;

export type PaletteId = keyof typeof PALETTES;

/** ← Change this to switch the whole game to another palette. */
export const ACTIVE_PALETTE: PaletteId = 'midnight';

/** The active palette's colours. */
export const C: Palette = PALETTES[ACTIVE_PALETTE];

/** A palette colour ('#rrggbb') at the given opacity (0…1), as an rgba() string. */
export function alpha(hex: string, opacity: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((ch) => ch + ch).join('') : h.slice(0, 6);
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${opacity})`;
}
