import React from 'react';
import { View, Text, StyleSheet, Pressable, Platform, Image } from 'react-native';
import { ACTIVE_THEME, ThemeConfig } from '../../constants/theme';

interface GameBoardBackgroundProps {
  hitLineY: number;
  activeLanes: boolean[]; // [lane0, lane1, lane2, lane3]
  laneFlashes?: boolean[];
  onLanePressStart?: (lane: 0 | 1 | 2 | 3) => void;
  onLanePressEnd?: (lane: 0 | 1 | 2 | 3) => void;
  theme?: ThemeConfig;
  showKeyLabels?: boolean;
  children?: React.ReactNode;
}

export const LANE_KEYS = ['D', 'F', 'J', 'K'] as const;

/**
 * 4-Lane React Native Rhythm Game Board Surface
 * Reads theme parameters for lane width, hit line, dividers, and background.
 * Provides multi-touch touch handling across all 4 vertical columns.
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
    <View style={[styles.root, { backgroundColor: board.backgroundColor }]}>
      {/* Optional Background Texture / Image */}
      {board.backgroundImageSource && (
        <Image
          source={board.backgroundImageSource}
          style={styles.backgroundImage}
          resizeMode="cover"
        />
      )}

      {/* 4 Lanes Container */}
      <View style={styles.lanesRow}>
        {([0, 1, 2, 3] as const).map((laneIndex) => {
          const isPressed = activeLanes[laneIndex];
          const isFlashing = laneFlashes[laneIndex];

          return (
            <Pressable
              key={laneIndex}
              style={[
                styles.laneColumn,
                {
                  borderRightWidth: laneIndex < 3 ? board.laneDividersWidth : 0,
                  borderRightColor: board.laneDividersColor,
                  backgroundColor: isFlashing
                    ? feedback.laneHitFlashColor
                    : isPressed
                    ? feedback.lanePressColor
                    : 'transparent',
                },
              ]}
              onPressIn={() => onLanePressStart?.(laneIndex)}
              onPressOut={() => onLanePressEnd?.(laneIndex)}
            >
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
                        borderColor: isPressed ? '#38bdf8' : 'rgba(255, 255, 255, 0.2)',
                        backgroundColor: isPressed ? 'rgba(56, 189, 248, 0.35)' : 'rgba(0, 0, 0, 0.5)',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.keyLabelText,
                        {
                          color: isPressed ? '#38bdf8' : board.laneKeyLabelsColor,
                        },
                      ]}
                    >
                      {LANE_KEYS[laneIndex]}
                    </Text>
                  </View>
                </View>
              )}

              {/* Lane Hit Area Indicator Glow at bottom */}
              <View
                pointerEvents="none"
                style={[
                  styles.laneBottomGlow,
                  {
                    backgroundColor: isPressed ? 'rgba(56, 189, 248, 0.25)' : 'transparent',
                  },
                ]}
              />
            </Pressable>
          );
        })}
      </View>

      {/* Tiles Layer Mounted Inside Board */}
      <View pointerEvents="none" style={styles.tilesLayer}>
        {children}
      </View>

      {/* Horizontal Hit Line (Near bottom of screen) */}
      <View
        pointerEvents="none"
        style={[
          styles.hitLine,
          {
            top: hitLineY,
            height: board.hitLineThickness,
            backgroundColor: board.hitLineColor,
            shadowColor: board.hitLineGlowColor,
            shadowOpacity: 0.85,
            shadowRadius: 10,
            elevation: 8,
          },
        ]}
      >
        <View style={styles.hitPipLeft} />
        <View style={styles.hitPipRight} />
      </View>

      {/* Hit Zone Highlight Band */}
      <View
        pointerEvents="none"
        style={[
          styles.hitZoneBand,
          {
            top: hitLineY - 24,
            backgroundColor: board.hitZoneOverlayColor,
          },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
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
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyLabelText: {
    fontSize: 12,
    fontWeight: 'bold',
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
    borderRadius: 4,
    backgroundColor: '#7dd3fc',
    marginLeft: -4,
  },
  hitPipRight: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#7dd3fc',
    marginRight: -4,
  },
  hitZoneBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 48,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: 'rgba(56, 189, 248, 0.3)',
    borderBottomColor: 'rgba(56, 189, 248, 0.3)',
  },
});
