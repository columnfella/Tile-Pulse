import React from 'react';
import { ACTIVE_THEME, ThemeConfig } from '../../constants/theme';

interface TapTileViewProps {
  y: number;
  height: number;
  lane: 0 | 1 | 2 | 3;
  isHit?: boolean;
  isMissed?: boolean;
  theme?: ThemeConfig;
  className?: string;
}

/**
 * Decoupled Tap Tile Component
 * Reads visual configuration and sample texture exclusively from theme.
 * Seamlessly swaps to custom image sprite when imageSource is defined.
 */
export const TapTileView: React.FC<TapTileViewProps> = ({
  y,
  height,
  lane,
  isHit = false,
  isMissed = false,
  theme = ACTIVE_THEME,
  className = '',
}) => {
  const { tapTile, geometry } = theme;

  if (isHit) {
    return (
      <div
        className="absolute left-1 right-1 pointer-events-none transition-all duration-200 transform scale-110 opacity-0"
        style={{
          top: `${y}px`,
          height: `${height}px`,
          boxShadow: `0 0 30px ${tapTile.activeGlowColor}`,
        }}
      />
    );
  }

  // If a custom image/sprite is provided in the theme, render it seamlessly
  if (tapTile.imageSource) {
    return (
      <div
        className={`absolute left-1 right-1 pointer-events-none transition-opacity duration-150 ${className} ${
          isMissed ? 'opacity-30 grayscale' : 'opacity-100'
        }`}
        style={{
          top: `${y}px`,
          height: `${height}px`,
        }}
      >
        <img
          src={tapTile.imageSource}
          alt={`Tap tile lane ${lane}`}
          className="w-full h-full object-cover"
          style={{ borderRadius: `${geometry.tileBorderRadius}px` }}
        />
      </div>
    );
  }

  // Sample Texture: Clean geometric modern dark tile with neon accent edge & glossy shine
  return (
    <div
      className={`absolute left-1 right-1 pointer-events-none overflow-hidden select-none transition-opacity duration-150 ${className} ${
        isMissed ? 'opacity-35 grayscale' : 'opacity-100'
      }`}
      style={{
        top: `${y}px`,
        height: `${height}px`,
        borderRadius: `${geometry.tileBorderRadius}px`,
        background: `linear-gradient(180deg, ${tapTile.gradientFrom} 0%, ${tapTile.solidColor} 100%)`,
        borderWidth: `${geometry.borderWidth}px`,
        borderColor: isMissed ? '#64748b' : tapTile.borderColor,
        boxShadow: isMissed ? 'none' : `0 4px 14px rgba(0, 0, 0, 0.45), inset 0 1px 1px rgba(255, 255, 255, 0.15)`,
      }}
    >
      {/* Top Gloss Highlight */}
      <div
        className="w-full h-2.5 opacity-40"
        style={{
          background: 'linear-gradient(180deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0) 100%)',
        }}
      />

      {/* Bottom Leading Edge Indicator (The Hit Anchor) */}
      <div
        className="absolute bottom-0 left-0 right-0 h-1.5"
        style={{
          backgroundColor: isMissed ? '#94a3b8' : tapTile.accentBarColor,
          boxShadow: isMissed ? 'none' : `0 0 8px ${tapTile.activeGlowColor}`,
        }}
      />

      {/* Center Subtle Geometric Watermark */}
      <div className="absolute inset-0 flex items-center justify-center opacity-20 pointer-events-none">
        <div
          className="w-6 h-6 border rotate-45"
          style={{ borderColor: tapTile.borderColor }}
        />
      </div>
    </div>
  );
};
