import React from 'react';
import { ACTIVE_THEME, ThemeConfig } from '../../constants/theme';

interface GameBoardBackgroundProps {
  hitLineY: number;
  activeLanes: boolean[]; // [lane0, lane1, lane2, lane3] is currently pressed
  laneFlashes?: boolean[]; // [lane0, lane1, lane2, lane3] momentary flash
  onLanePressStart?: (lane: 0 | 1 | 2 | 3) => void;
  onLanePressEnd?: (lane: 0 | 1 | 2 | 3) => void;
  theme?: ThemeConfig;
  showKeyLabels?: boolean;
  children?: React.ReactNode;
}

export const LANE_KEYS = ['D', 'F', 'J', 'K'] as const;

/**
 * 4-Lane Rhythm Game Board Surface
 * Reads theme parameters for lane width, hit line, dividers, and background.
 * Provides multi-touch pointer event zones across all 4 vertical columns.
 */
export const GameBoardBackground: React.FC<GameBoardBackgroundProps> = ({
  hitLineY,
  activeLanes,
  laneFlashes = [false, false, false, false],
  onLanePressStart,
  onLanePressEnd,
  theme = ACTIVE_THEME,
  showKeyLabels = true,
  children,
}) => {
  const { board, feedback } = theme;

  return (
    <div
      className="relative w-full h-full overflow-hidden select-none touch-none"
      style={{
        backgroundColor: board.backgroundColor,
      }}
    >
      {/* Optional Background Texture / Image */}
      {board.backgroundImageSource && (
        <img
          src={board.backgroundImageSource}
          alt="Board background"
          className="absolute inset-0 w-full h-full object-cover pointer-events-none opacity-30"
        />
      )}

      {/* 4 Lanes Container */}
      <div className="absolute inset-0 flex">
        {([0, 1, 2, 3] as const).map((laneIndex) => {
          const isPressed = activeLanes[laneIndex];
          const isFlashing = laneFlashes[laneIndex];

          return (
            <div
              key={laneIndex}
              className="relative flex-1 h-full flex flex-col justify-end transition-colors duration-75"
              style={{
                borderRight:
                  laneIndex < 3
                    ? `${board.laneDividersWidth}px solid ${board.laneDividersColor}`
                    : 'none',
                backgroundColor: isFlashing
                  ? feedback.laneHitFlashColor
                  : isPressed
                  ? feedback.lanePressColor
                  : 'transparent',
              }}
              onPointerDown={(e) => {
                e.preventDefault();
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                onLanePressStart?.(laneIndex);
              }}
              onPointerUp={(e) => {
                e.preventDefault();
                try {
                  (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                } catch {}
                onLanePressEnd?.(laneIndex);
              }}
              onPointerCancel={(e) => {
                e.preventDefault();
                try {
                  (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                } catch {}
                onLanePressEnd?.(laneIndex);
              }}
            >
              {/* Lane Key Badge / Prompt at Hit Line */}
              {showKeyLabels && (
                <div
                  className="absolute pointer-events-none w-full flex flex-col items-center justify-center transition-opacity"
                  style={{
                    top: `${hitLineY - 32}px`,
                    opacity: isPressed ? 0.9 : 0.45,
                  }}
                >
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border transition-transform"
                    style={{
                      borderColor: isPressed ? '#38bdf8' : 'rgba(255,255,255,0.2)',
                      backgroundColor: isPressed ? 'rgba(56,189,248,0.3)' : 'rgba(0,0,0,0.4)',
                      color: isPressed ? '#38bdf8' : board.laneKeyLabelsColor,
                      transform: isPressed ? 'scale(1.15)' : 'scale(1)',
                    }}
                  >
                    {LANE_KEYS[laneIndex]}
                  </div>
                </div>
              )}

              {/* Lane Hit Area Subtle Indicator Glow */}
              <div
                className="pointer-events-none w-full transition-opacity duration-75"
                style={{
                  height: '90px',
                  background: isPressed
                    ? 'linear-gradient(180deg, rgba(56, 189, 248, 0.35) 0%, rgba(56, 189, 248, 0.05) 100%)'
                    : 'transparent',
                }}
              />
            </div>
          );
        })}
      </div>

      {/* Tiles Layer Mounted Inside Board */}
      <div className="absolute inset-0 pointer-events-none">
        {children}
      </div>

      {/* Horizontal Hit Line (Near bottom of screen) */}
      <div
        className="absolute left-0 right-0 pointer-events-none flex items-center"
        style={{
          top: `${hitLineY}px`,
          height: `${board.hitLineThickness}px`,
          backgroundColor: board.hitLineColor,
          boxShadow: `0 0 14px ${board.hitLineGlowColor}, 0 0 28px ${board.hitLineGlowColor}`,
        }}
      >
        {/* Decorative corner target pips */}
        <div className="absolute -left-1 w-2.5 h-2.5 rounded-full bg-sky-300 shadow" />
        <div className="absolute -right-1 w-2.5 h-2.5 rounded-full bg-sky-300 shadow" />
      </div>

      {/* Hit Zone Highlight Band */}
      <div
        className="absolute left-0 right-0 pointer-events-none"
        style={{
          top: `${hitLineY - 24}px`,
          height: '48px',
          background: board.hitZoneOverlayColor,
          borderTop: '1px dashed rgba(56, 189, 248, 0.3)',
          borderBottom: '1px dashed rgba(56, 189, 248, 0.3)',
        }}
      />
    </div>
  );
};
