import { ImageSourcePropType } from 'react-native';

import { C, alpha, themed } from '../theme/palette';
/**
 * Modular Theme & Texture Architecture for TilePulse
 * 
 * Defines ACTIVE_THEME with colors, border radii, lane widths,
 * and optional imageSource?: ImageSourcePropType | null slots set to null by default.
 * 
 * If imageSource is null, components render clean geometric sample textures.
 * If custom sprites are provided, they render <ImageBackground> / <Image> seamlessly.
 */

/**
 * PLAY SCREEN SIZE DIAL — change SCALE to resize the whole play grid at once.
 *
 * The board is a rigid grid of rows, like Piano Tiles: one row = one tap tile.
 * Each song's usual note spacing is exactly one row, so notes in consecutive
 * rows touch and a skipped row leaves exactly one tile of empty space. The
 * scroll speed follows from that (timing never changes, only sizes / speed).
 *   SCALE 1 = the original size · 1.5 = 50 % taller (current) · 2 = double
 */
export const PLAY_GRID = {
  SCALE: 1.5,
  /** Height of one grid row (= one tap tile) at SCALE 1. */
  BASE_MAX_TILE_HEIGHT: 144,
  /** Fallback scroll (px per beat at SCALE 1), used only where no song is known. */
  BASE_PIXELS_PER_BEAT: 260,
  /**
   * Rows can't pass faster than one per this many seconds: in very dense
   * songs, notes closer than that share a row and their tiles shrink to fit.
   */
  MIN_ROW_SECONDS: 0.15,
  /** Shortest a tap tile gets at SCALE 1 (very dense passages). */
  BASE_MIN_TILE_HEIGHT: 30,
  /** Gap between rows of tiles, in px (not scaled). */
  ROW_GAP: 4,
} as const;

export interface ThemeConfig {
  id: string;
  name: string;
  
  geometry: {
    lanesCount: 4;
    laneWidthPercent: number; // 25% for 4 lanes
    hitLineYPercent: number;  // 82% from top of screen
    defaultTapTileHeightPx: number;
    pixelsPerBeat: number;
    borderWidth: number;
    tileBorderRadius: number;
  };

  tapTile: {
    solidColor: string;
    gradientFrom: string;
    gradientTo: string;
    borderColor: string;
    activeGlowColor: string;
    accentBarColor: string;
    imageSource?: ImageSourcePropType | null;
  };

  holdTile: {
    headColor: string;
    tailColor: string;
    bodyColor: string;
    bodyBorderColor: string;
    activeFillColor: string;
    activeGlowColor: string;
    stripesPattern: boolean;
    imageSource?: ImageSourcePropType | null;
  };

  board: {
    backgroundColor: string;
    laneDividersColor: string;
    laneDividersWidth: number;
    hitLineColor: string;
    hitLineGlowColor: string;
    hitLineThickness: number;
    hitZoneOverlayColor: string;
    laneKeyLabelsColor: string;
    backgroundImageSource?: ImageSourcePropType | null;
  };

  feedback: {
    lanePressColor: string;
    laneHitFlashColor: string;
    judgments: {
      perfect: { text: string; color: string; glow: string };
      great: { text: string; color: string; glow: string };
      good: { text: string; color: string; glow: string };
      miss: { text: string; color: string; glow: string };
    };
  };

  ui: {
    appBackground: string;
    surfaceBackground: string;
    cardBackground: string;
    cardBorder: string;
    primaryAccent: string;
    primaryAccentHover: string;
    secondaryAccent: string;
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    danger: string;
    success: string;
  };
}

export const MINIMAL_DARK_THEME: ThemeConfig = themed(() => ({
  id: 'minimal_dark',
  name: 'Minimal Dark Neon',
  geometry: {
    lanesCount: 4,
    laneWidthPercent: 25,
    hitLineYPercent: 82,
    // Both come from the PLAY_GRID dial above
    defaultTapTileHeightPx: PLAY_GRID.BASE_MAX_TILE_HEIGHT * PLAY_GRID.SCALE,
    pixelsPerBeat: PLAY_GRID.BASE_PIXELS_PER_BEAT * PLAY_GRID.SCALE,
    borderWidth: 3,
    tileBorderRadius: 0, // pixel art: square corners
  },
  tapTile: {
    solidColor: C.panel,
    gradientFrom: C.panelLight,
    gradientTo: C.bg,
    borderColor: C.blue,
    activeGlowColor: alpha(C.blue, 0.6),
    accentBarColor: C.blue,
    imageSource: null,
  },
  holdTile: {
    headColor: C.accentDark,
    tailColor: C.accent,
    bodyColor: alpha(C.blue, 0.22),
    bodyBorderColor: alpha(C.blue, 0.7),
    activeFillColor: C.accent,
    activeGlowColor: alpha(C.blue, 0.85),
    stripesPattern: true,
    imageSource: null,
  },
  board: {
    backgroundColor: C.bg,
    laneDividersColor: alpha(C.textDim, 0.18),
    laneDividersWidth: 2,
    hitLineColor: C.text,
    hitLineGlowColor: alpha(C.blue, 0.75),
    hitLineThickness: 4,
    hitZoneOverlayColor: alpha(C.text, 0.05),
    laneKeyLabelsColor: alpha(C.white, 0.4),
    backgroundImageSource: null,
  },
  feedback: {
    lanePressColor: alpha(C.text, 0.10),
    laneHitFlashColor: alpha(C.white, 0.45),
    judgments: {
      perfect: { text: 'PERFECT', color: C.accent, glow: C.accent },
      great: { text: 'GREAT', color: C.blue, glow: C.blueDeeper },
      good: { text: 'GOOD', color: C.blue, glow: C.blueDeeper },
      miss: { text: 'MISS', color: C.accent, glow: C.dangerDeep },
    },
  },
  ui: {
    appBackground: C.bg,
    surfaceBackground: C.panel,
    cardBackground: C.card,
    cardBorder: alpha(C.white, 0.08),
    primaryAccent: C.accent,
    primaryAccentHover: C.accentDark,
    secondaryAccent: C.blueStrong,
    textPrimary: C.text,
    textSecondary: C.textDim,
    textMuted: C.textSubtle,
    danger: C.accent,
    success: C.blue,
  },
}));

export const ACTIVE_THEME: ThemeConfig = MINIMAL_DARK_THEME;
