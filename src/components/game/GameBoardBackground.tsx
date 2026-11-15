import React, { useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  Image,
  type GestureResponderEvent,
} from 'react-native';
import { ACTIVE_THEME, ThemeConfig } from '../../constants/theme';
import { FONTS } from '../../theme/pixel';

interface GameBoardBackgroundProps {
  hitLineY: number;
  onLanePressStart?: (lane: 0 | 1 | 2 | 3) => void;
  onLanePressEnd?: (lane: 0 | 1 | 2 | 3) => void;
  theme?: ThemeConfig;
  showKeyLabels?: boolean;
  children?: React.ReactNode;
  /** Animated layer drawn behind the lanes (e.g. the song's background). */
  backdrop?: React.ReactNode;
}

export const LANE_KEYS = ['D', 'F', 'J', 'K'] as const;

type Lane = 0 | 1 | 2 | 3;

// React Native's responder system only lets one Pressable be touched at a
// time, which breaks chords and holding one lane while tapping another. On
// native we read raw multi-touch events instead and map each finger to a lane.
const USE_MULTI_TOUCH = Platform.OS !== 'web';

/**
 * 4-Lane React Native Rhythm Game Board Surface
 * Reads theme parameters for lane width, hit line, dividers, and background.
 * Provides multi-touch touch handling across all 4 vertical columns.
 */
export const GameBoardBackground: React.FC<GameBoardBackgroundProps> = ({
  hitLineY,
  onLanePressStart,
  onLanePressEnd,
  theme = ACTIVE_THEME,
  showKeyLabels = true,
  children,
  backdrop,
}) => {
  const { board } = theme;

  const boardRef = useRef<React.ComponentRef<typeof View>>(null);
  const boardFrame = useRef({ x: 0, width: 1 });
  const touchLanes = useRef(new Map<string, Lane>());

  // Hit feedback is a background flash (see useHitFlash), not a lane highlight
  const pressLane = (lane: Lane) => onLanePressStart?.(lane);
  const releaseLane = (lane: Lane) => onLanePressEnd?.(lane);

  const handleLayout = () => {
    boardRef.current?.measureInWindow((x, _y, width) => {
      if (width > 0) boardFrame.current = { x, width };
    });
  };

  const laneForX = (pageX: number): Lane => {
    const { x, width } = boardFrame.current;
    const idx = Math.floor(((pageX - x) / width) * 4);
    return Math.max(0, Math.min(3, idx)) as Lane;
  };

  const handleTouchStart = (e: GestureResponderEvent) => {
    for (const t of e.nativeEvent.changedTouches) {
      const id = String(t.identifier);
      if (touchLanes.current.has(id)) continue;
      const lane = laneForX(t.pageX);
      touchLanes.current.set(id, lane);
      pressLane(lane);
    }
  };

  const handleTouchMove = (e: GestureResponderEvent) => {
    for (const t of e.nativeEvent.changedTouches) {
      const id = String(t.identifier);
      const prev = touchLanes.current.get(id);
      if (prev === undefined) continue;
      const lane = laneForX(t.pageX);
      if (lane !== prev) {
        // Finger slid into another lane: release the old one, press the new one
        touchLanes.current.set(id, lane);
        if (![...touchLanes.current.values()].includes(prev)) releaseLane(prev);
        pressLane(lane);
      }
    }
  };

  const handleTouchEnd = (e: GestureResponderEvent) => {
    for (const t of e.nativeEvent.changedTouches) {
      const id = String(t.identifier);
      const lane = touchLanes.current.get(id);
      if (lane === undefined) continue;
      touchLanes.current.delete(id);
      // Only release if no other finger is still on this lane
      if (![...touchLanes.current.values()].includes(lane)) releaseLane(lane);
    }
  };

  const touchHandlers = USE_MULTI_TOUCH
    ? {
        onTouchStart: handleTouchStart,
        onTouchMove: handleTouchMove,
        onTouchEnd: handleTouchEnd,
        onTouchCancel: handleTouchEnd,
      }
    : {};

  return (
    <View
      ref={boardRef}
      onLayout={handleLayout}
      style={[styles.root, { backgroundColor: board.backgroundColor }]}
      {...touchHandlers}
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
            <Pressable
              key={laneIndex}
              style={[
                styles.laneColumn,
                {
                  borderRightWidth: laneIndex < 3 ? board.laneDividersWidth : 0,
                  borderRightColor: board.laneDividersColor,
                },
              ]}
              disabled={USE_MULTI_TOUCH}
              onPressIn={USE_MULTI_TOUCH ? undefined : () => pressLane(laneIndex)}
              onPressOut={USE_MULTI_TOUCH ? undefined : () => releaseLane(laneIndex)}
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
                        borderColor: isPressed ? '#4d8dff' : 'rgba(255, 255, 255, 0.2)',
                        backgroundColor: isPressed ? 'rgba(77, 141, 255, 0.35)' : 'rgba(0, 0, 0, 0.5)',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.keyLabelText,
                        {
                          color: isPressed ? '#4d8dff' : board.laneKeyLabelsColor,
                        },
                      ]}
                    >
                      {LANE_KEYS[laneIndex]}
                    </Text>
                  </View>
                </View>
              )}

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
    backgroundColor: '#8fb8ff',
    marginLeft: -4,
  },
  hitPipRight: {
    width: 8,
    height: 8,
    borderRadius: 0,
    backgroundColor: '#8fb8ff',
    marginRight: -4,
  },
  hitZoneBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 48,
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderTopColor: 'rgba(77, 141, 255, 0.3)',
    borderBottomColor: 'rgba(77, 141, 255, 0.3)',
  },
});
