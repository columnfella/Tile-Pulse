import { ImageSourcePropType } from 'react-native';

/**
 * Modular Theme & Texture Architecture for TilePulse
 * 
 * Defines ACTIVE_THEME with colors, border radii, lane widths,
 * and optional imageSource?: ImageSourcePropType | null slots set to null by default.
 * 
 * If imageSource is null, components render clean geometric sample textures.
 * If custom sprites are provided, they render <ImageBackground> / <Image> seamlessly.
 */

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

export const MINIMAL_DARK_THEME: ThemeConfig = {
  id: 'minimal_dark',
  name: 'Minimal Dark Neon',
  geometry: {
    lanesCount: 4,
    laneWidthPercent: 25,
    hitLineYPercent: 82,
    defaultTapTileHeightPx: 144, // 20% taller than the original 120px
    pixelsPerBeat: 260,
    borderWidth: 2,
    tileBorderRadius: 8,
  },
  tapTile: {
    solidColor: '#0f172a',
    gradientFrom: '#1e293b',
    gradientTo: '#090d16',
    borderColor: '#38bdf8',
    activeGlowColor: 'rgba(56, 189, 248, 0.6)',
    accentBarColor: '#38bdf8',
    imageSource: null,
  },
  holdTile: {
    headColor: '#0369a1',
    tailColor: '#0284c7',
    bodyColor: 'rgba(14, 165, 233, 0.22)',
    bodyBorderColor: 'rgba(56, 189, 248, 0.7)',
    activeFillColor: '#0284c7',
    activeGlowColor: 'rgba(56, 189, 248, 0.85)',
    stripesPattern: true,
    imageSource: null,
  },
  board: {
    backgroundColor: '#030712',
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

export const ACTIVE_THEME: ThemeConfig = MINIMAL_DARK_THEME;
