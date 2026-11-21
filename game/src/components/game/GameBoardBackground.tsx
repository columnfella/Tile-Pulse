import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { ACTIVE_THEME, ThemeConfig } from '../../constants/theme';
import { FONTS } from '../../theme/pixel';
// Platform files: LaneTouchSurface.tsx (app, raw multi-touch) / LaneTouchSurface.web.tsx (browser pointer events)
import { LaneTouchSurface, type Lane } from './LaneTouchSurface';

import { C, alpha, themedStyles } from '../../theme/palette';
interface GameBoardBackgroundProps {
  hitLineY: number;
  /** `glide`: the finger slid into this lane instead of touching down. */
  /** `y`: where the finger landed, in px from the top of the board (when known). */
  onLanePressStart?: (lane: 0 | 1 | 2 | 3, glide?: boolean, y?: number) => void;
  onLanePressEnd?: (lane: 0 | 1 | 2 | 3) => void;
  /**
   * Horizontal position of every finger on the board, in lanes (0 = left
   * edge, 4 = right edge). Reported on every touch change; used by slides.
   */
  onFingersChange?: (fingers: number[]) => void;
  theme?: ThemeConfig;
  showKeyLabels?: boolean;
  children?: React.ReactNode;
  /** Animated layer drawn behind the lanes (e.g. the song's background). */
  backdrop?: React.ReactNode;
  /** Per lane (0–3): 0…1 strength of the soft red "nothing to hit here" flash. */
  emptyPressFlash?: SharedValue<number>[];
}

/** Soft red overlay on a lane after a press that hit no tile. */
function EmptyPressFlash({ value }: { value: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({ opacity: value.value }));
  return <Animated.View pointerEvents="none" style={[styles.emptyFlash, style]} />;
}

export const LANE_KEYS = ['D', 'F', 'J', 'K'] as const;

/**
 * 4-Lane Rhythm Game Board Surface
 * Reads theme parameters for lane width, hit line, dividers, and background.
 * Touch input comes from LaneTouchSurface (one implementation per platform).
 */
export const GameBoardBackground: React.FC<GameBoardBackgroundProps> = ({
  hitLineY,
  onLanePressStart,
  onLanePressEnd,
  onFingersChange,
  theme = ACTIVE_THEME,
  // No hit line any more (tap tiles anywhere), so no key badges sitting on it
  showKeyLabels = false,
  children,
  backdrop,
  emptyPressFlash,
}) => {
  const { board } = theme;

  return (
    <LaneTouchSurface
      style={[styles.root, { backgroundColor: board.backgroundColor }]}
      onPressStart={(lane: Lane, glide: boolean, y?: number) => onLanePressStart?.(lane, glide, y)}
      onPressEnd={(lane: Lane) => onLanePressEnd?.(lane)}
      onFingersChange={onFingersChange}
    >
      {/* Optional Background Texture / Image */}
      {board.backgroundImageSource && (
        <Image
          source={board.backgroundImageSource}
          style={styles.backgroundImage}
          resizeMode="cover"
        />
      )}

      {backdrop}

      {/* 4 Lanes Container */}
      <View style={styles.lanesRow}>
        {([0, 1, 2, 3] as const).map((laneIndex) => {
          const isPressed = false; // key labels are static (web only)

          return (
            <View
              key={laneIndex}
              pointerEvents="none"
              // Every other lane slightly lighter, so each reads as its own wide column
              style={[styles.laneColumn, laneIndex % 2 === 1 && styles.laneTint]}
            >
              {emptyPressFlash?.[laneIndex] ? <EmptyPressFlash value={emptyPressFlash[laneIndex]} /> : null}

              {/* Lane Key Badge / Prompt at Hit Line */}
              {showKeyLabels && (
                <View
                  pointerEvents="none"
                  style={[
                    styles.keyLabelContainer,
                    {
                      top: hitLineY - 34,
                      opacity: isPressed ? 1 : 0.45,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.keyLabelBadge,
                      {
                        borderColor: isPressed ? C.blue : alpha(C.white, 0.2),
                        backgroundColor: isPressed ? alpha(C.blue, 0.35) : alpha(C.black, 0.5),
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.keyLabelText,
                        {
                          color: isPressed ? C.blue : board.laneKeyLabelsColor,
                        },
                      ]}
                    >
                      {LANE_KEYS[laneIndex]}
                    </Text>
                  </View>
                </View>
              )}

            </View>
          );
        })}
      </View>

      {/* Lane lines, centred exactly on the 25 / 50 / 75 % boundaries (as separate
          strips, not column borders, so every tile has the same gap on both sides) */}
      <View pointerEvents="none" style={styles.dividers}>
        {[1, 2, 3].map((k) => (
          <View
            key={k}
            style={[
              styles.divider,
              {
                left: `${k * 25}%`,
                width: board.laneDividersWidth,
                marginLeft: -board.laneDividersWidth / 2,
                backgroundColor: board.laneDividersColor,
              },
            ]}
          />
        ))}
      </View>

      {/* Tiles Layer Mounted Inside Board */}
      <View pointerEvents="none" style={styles.tilesLayer}>
        {children}
      </View>
    </LaneTouchSurface>
  );
};

const styles = themedStyles(() => ({
  root: {
    flex: 1,
    width: '100%',
    height: '100%',
    position: 'relative',
    overflow: 'hidden',
  },
  backgroundImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.3,
  },
  laneTint: { backgroundColor: alpha(C.textDim, 0.035) },
  emptyFlash: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: alpha(C.error, 0.28) },
  dividers: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  divider: { position: 'absolute', top: 0, bottom: 0 },
  tilesLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  lanesRow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
  },
  laneColumn: {
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
  },
  keyLabelContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyLabelBadge: {
    width: 28,
    height: 28,
    borderRadius: 0,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyLabelText: {
    fontFamily: FONTS.body,
    fontSize: 17,
  },
  laneBottomGlow: {
    height: 80,
    width: '100%',
  },
  hitLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  hitPipLeft: {
    width: 8,
    height: 8,
    borderRadius: 0,
    backgroundColor: C.blueMist,
    marginLeft: -4,
  },
  hitPipRight: {
    width: 8,
    height: 8,
    borderRadius: 0,
    backgroundColor: C.blueMist,
    marginRight: -4,
  },
  hitZoneBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 48,
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderTopColor: alpha(C.blue, 0.3),
    borderBottomColor: alpha(C.blue, 0.3),
  },
}));
