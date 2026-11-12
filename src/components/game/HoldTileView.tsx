import React from 'react';
import { ACTIVE_THEME, ThemeConfig } from '../../constants/theme';

interface HoldTileViewProps {
  y: number;
  height: number;
  lane: 0 | 1 | 2 | 3;
  isHolding?: boolean;
  holdProgress?: number; // 0.0 to 1.0
  isHit?: boolean;
  isMissed?: boolean;
  theme?: ThemeConfig;
  className?: string;
}

/**
 * Decoupled Hold Tile Component
 * Renders both unheld body and active dynamic filling state as it passes the hit line.
 * Reads visual configuration and sample texture exclusively from theme.
 */
export const HoldTileView: React.FC<HoldTileViewProps> = ({
  y,
  height,
  lane,
  isHolding = false,
  holdProgress = 0,
  isHit = false,
  isMissed = false,
  theme = ACTIVE_THEME,
  className = '',
}) => {
  const { holdTile, geometry } = theme;

  if (isHit && holdProgress >= 1) {
    return (
      <div
        className="absolute left-1 right-1 pointer-events-none transition-all duration-300 transform scale-105 opacity-0"
        style={{
          top: `${y}px`,
          height: `${height}px`,
          boxShadow: `0 0 35px ${holdTile.activeGlowColor}`,
        }}
      />
    );
  }

  // Custom sprite hook
  if (holdTile.imageSource) {
    return (
      <div
        className={`absolute left-1 right-1 pointer-events-none ${className} ${
          isMissed ? 'opacity-30 grayscale' : 'opacity-100'
        }`}
        style={{
          top: `${y}px`,
          height: `${height}px`,
        }}
      >
        <img
          src={holdTile.imageSource}
          alt={`Hold tile lane ${lane}`}
          className="w-full h-full object-cover"
          style={{ borderRadius: `${geometry.tileBorderRadius}px` }}
        />
      </div>
    );
  }

  // Sample Texture: Elongated body with leading head cap, trailing tail, active energy fill bar
  const clampedProgress = Math.min(1, Math.max(0, holdProgress));
  const fillPercentage = clampedProgress * 100;

  return (
    <div
      className={`absolute left-1 right-1 pointer-events-none overflow-hidden select-none transition-opacity duration-150 ${className} ${
        isMissed ? 'opacity-35 grayscale' : 'opacity-100'
      }`}
      style={{
        top: `${y}px`,
        height: `${height}px`,
        borderRadius: `${geometry.tileBorderRadius}px`,
        backgroundColor: holdTile.bodyColor,
        borderWidth: `${geometry.borderWidth}px`,
        borderColor: isHolding ? '#38bdf8' : isMissed ? '#64748b' : holdTile.bodyBorderColor,
        boxShadow: isHolding
          ? `0 0 20px ${holdTile.activeGlowColor}, inset 0 0 15px rgba(56, 189, 248, 0.4)`
          : isMissed
          ? 'none'
          : '0 4px 12px rgba(0,0,0,0.3)',
      }}
    >
      {/* Subtle musical diagonal stripes pattern */}
      {holdTile.stripesPattern && (
        <div
          className="absolute inset-0 opacity-15"
          style={{
            backgroundImage: `repeating-linear-gradient(45deg, #fff 0, #fff 2px, transparent 2px, transparent 12px)`,
          }}
        />
      )}

      {/* Dynamic Active Hold Filling Bar (fills upward from bottom head cap as player holds) */}
      <div
        className="absolute bottom-0 left-0 right-0 transition-all duration-75"
        style={{
          height: `${fillPercentage}%`,
          background: holdTile.activeFillColor,
          opacity: isHolding ? 0.9 : 0.4,
          boxShadow: isHolding ? `0 0 12px #38bdf8` : 'none',
        }}
      />

      {/* Leading Edge / Head Cap (The initial tap hit target at the bottom) */}
      <div
        className="absolute bottom-0 left-0 right-0 h-10 flex items-center justify-center font-black text-xs tracking-wider"
        style={{
          backgroundColor: isHolding ? '#0284c7' : isMissed ? '#475569' : holdTile.headColor,
          borderTopWidth: '1px',
          borderTopColor: 'rgba(255,255,255,0.3)',
          color: '#ffffff',
          textShadow: '0 1px 2px rgba(0,0,0,0.8)',
        }}
      >
        <span className="opacity-90">HOLD</span>
        {isHolding && (
          <span className="ml-1 text-[10px] animate-pulse text-sky-200">
            {Math.round(clampedProgress * 100)}%
          </span>
        )}
      </div>

      {/* Trailing Tail Cap (at the top) */}
      <div
        className="absolute top-0 left-0 right-0 h-2 opacity-80"
        style={{
          backgroundColor: holdTile.tailColor,
        }}
      />
    </div>
  );
};
