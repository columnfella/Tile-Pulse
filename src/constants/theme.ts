/**
 * Modular Theme & Texture Configuration for TilePulse
 * 
 * All visual styles, sample textures, geometry dimensions, and sprite image slots
 * are isolated here. Any tile or board component reads from ACTIVE_THEME.
 * 
 * To swap custom art/sprites in the future, assign an image URI or asset path
 * to the respective `imageSource` slot (currently `null`).
 */

export interface ThemeConfig {
  id: string;
  name: string;
  
  // Board & Geometry
  geometry: {
    lanesCount: 4;
    laneWidthPercent: number; // 25% for 4 lanes
    hitLineYPercent: number;  // 82% from top of screen
    defaultTapTileHeightPx: number; // height for instantaneous tap tiles
    pixelsPerBeat: number;    // default speed factor
    borderWidth: number;
    tileBorderRadius: number;
  };

  // Normal Tap Tile
  tapTile: {
    solidColor: string;
    gradientFrom: string;
    gradientTo: string;
    borderColor: string;
    activeGlowColor: string;
    accentBarColor: string;
    imageSource: string | null; // Placeholder slot for sprite / custom texture
  };

  // Hold Tile
  holdTile: {
    headColor: string;
    tailColor: string;
    bodyColor: string;
    bodyBorderColor: string;
    activeFillColor: string;
    activeGlowColor: string;
    stripesPattern: boolean;
    imageSource: string | null; // Placeholder slot for hold body/head sprite
  };

  // Lanes & Board
  board: {
    backgroundColor: string;
    laneDividersColor: string;
    laneDividersWidth: number;
    hitLineColor: string;
    hitLineGlowColor: string;
    hitLineThickness: number;
    hitZoneOverlayColor: string;
    laneKeyLabelsColor: string;
    backgroundImageSource: string | null;
  };

  // Feedback & Judgments
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

  // General App & Navigation UI
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

export const MINIMAL_DARK_THEME: ThemeConfig = {
  id: 'minimal_dark',
  name: 'Minimal Dark (Standard)',
  geometry: {
    lanesCount: 4,
    laneWidthPercent: 25,
    hitLineYPercent: 82,
    defaultTapTileHeightPx: 120,
    pixelsPerBeat: 260,
    borderWidth: 2,
    tileBorderRadius: 8,
  },
  tapTile: {
    solidColor: '#0f172a', // Slate 900
    gradientFrom: '#1e293b', // Slate 800
    gradientTo: '#090d16',
    borderColor: '#38bdf8', // Sky 400 crisp accent border
    activeGlowColor: 'rgba(56, 189, 248, 0.6)',
    accentBarColor: '#38bdf8',
    imageSource: null, // Set to image URI when custom sprite is provided
  },
  holdTile: {
    headColor: '#0369a1', // Sky 700
    tailColor: '#0284c7', // Sky 600
    bodyColor: 'rgba(14, 165, 233, 0.22)',
    bodyBorderColor: 'rgba(56, 189, 248, 0.7)',
    activeFillColor: 'linear-gradient(to top, #38bdf8, #0284c7)',
    activeGlowColor: 'rgba(56, 189, 248, 0.85)',
    stripesPattern: true,
    imageSource: null, // Set to image URI when custom sprite is provided
  },
  board: {
    backgroundColor: '#030712', // Neutral pitch black
    laneDividersColor: 'rgba(255, 255, 255, 0.12)',
    laneDividersWidth: 1,
    hitLineColor: '#38bdf8',
    hitLineGlowColor: 'rgba(56, 189, 248, 0.75)',
    hitLineThickness: 3,
    hitZoneOverlayColor: 'rgba(56, 189, 248, 0.08)',
    laneKeyLabelsColor: 'rgba(255, 255, 255, 0.4)',
    backgroundImageSource: null,
  },
  feedback: {
    lanePressColor: 'rgba(56, 189, 248, 0.18)',
    laneHitFlashColor: 'rgba(255, 255, 255, 0.45)',
    judgments: {
      perfect: { text: 'PERFECT', color: '#38bdf8', glow: 'rgba(56, 189, 248, 0.8)' },
      great: { text: 'GREAT', color: '#4ade80', glow: 'rgba(74, 222, 128, 0.8)' },
      good: { text: 'GOOD', color: '#fbbf24', glow: 'rgba(251, 191, 36, 0.8)' },
      miss: { text: 'MISS', color: '#f87171', glow: 'rgba(248, 113, 113, 0.8)' },
    },
  },
  ui: {
    appBackground: '#090d16',
    surfaceBackground: '#0f172a',
    cardBackground: '#131b2e',
    cardBorder: 'rgba(255, 255, 255, 0.08)',
    primaryAccent: '#0284c7',
    primaryAccentHover: '#0369a1',
    secondaryAccent: '#6366f1',
    textPrimary: '#f8fafc',
    textSecondary: '#94a3b8',
    textMuted: '#64748b',
    danger: '#ef4444',
    success: '#10b981',
  },
};

/**
 * Active theme export used throughout all game components
 */
export const ACTIVE_THEME: ThemeConfig = MINIMAL_DARK_THEME;
