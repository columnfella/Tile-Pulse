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
    borderWidth: 3,
    tileBorderRadius: 0, // pixel art: square corners
  },
  tapTile: {
    solidColor: '#0b1220',
    gradientFrom: '#15203a',
    gradientTo: '#05070d',
    borderColor: '#4d8dff',
    activeGlowColor: 'rgba(77, 141, 255, 0.6)',
    accentBarColor: '#4d8dff',
    imageSource: null,
  },
  holdTile: {
    headColor: '#d9502f',
    tailColor: '#FF6B4A',
    bodyColor: 'rgba(77, 141, 255, 0.22)',
    bodyBorderColor: 'rgba(77, 141, 255, 0.7)',
    activeFillColor: '#FF6B4A',
    activeGlowColor: 'rgba(77, 141, 255, 0.85)',
    stripesPattern: true,
    imageSource: null,
  },
  board: {
    backgroundColor: '#05070d',
    laneDividersColor: 'rgba(154, 167, 194, 0.18)',
    laneDividersWidth: 2,
    hitLineColor: '#e6ecf7',
    hitLineGlowColor: 'rgba(77, 141, 255, 0.75)',
    hitLineThickness: 4,
    hitZoneOverlayColor: 'rgba(230, 236, 247, 0.05)',
    laneKeyLabelsColor: 'rgba(255, 255, 255, 0.4)',
    backgroundImageSource: null,
  },
  feedback: {
    lanePressColor: 'rgba(230, 236, 247, 0.10)',
    laneHitFlashColor: 'rgba(255, 255, 255, 0.45)',
    judgments: {
      perfect: { text: 'PERFECT', color: '#FF6B4A', glow: '#FF6B4A' },
      great: { text: 'GREAT', color: '#4d8dff', glow: '#1a3d99' },
      good: { text: 'GOOD', color: '#4d8dff', glow: '#1a3d99' },
      miss: { text: 'MISS', color: '#FF6B4A', glow: '#5c2414' },
    },
  },
  ui: {
    appBackground: '#05070d',
    surfaceBackground: '#0b1220',
    cardBackground: '#0e1628',
    cardBorder: 'rgba(255, 255, 255, 0.08)',
    primaryAccent: '#FF6B4A',
    primaryAccentHover: '#d9502f',
    secondaryAccent: '#2f6bff',
    textPrimary: '#e6ecf7',
    textSecondary: '#9aa7c2',
    textMuted: '#6b7a99',
    danger: '#FF6B4A',
    success: '#4d8dff',
  },
};

export const ACTIVE_THEME: ThemeConfig = MINIMAL_DARK_THEME;
