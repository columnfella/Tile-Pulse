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
  onFingersChange,
  theme = ACTIVE_THEME,
  // No hit line any more (tap tiles anywhere), so no key badges sitting on it
  showKeyLabels = false,
  children,
  backdrop,
}) => {
  const { board } = theme;

  const boardRef = useRef<React.ComponentRef<typeof View>>(null);
  const boardFrame = useRef({ x: 0, y: 0, width: 1 });
  const pressY = useRef<number | null>(null);
  const touchLanes = useRef(new Map<string, Lane>());
  const fingerX = useRef(new Map<string, number>());
  const emitFingers = () => onFingersChange?.([...fingerX.current.values()]);

  // Hit feedback is a background flash (see useHitFlash), not a lane highlight
  const pressLane = (lane: Lane, glide = false, y?: number) => onLanePressStart?.(lane, glide, y);
  const releaseLane = (lane: Lane) => onLanePressEnd?.(lane);

  const handleLayout = () => {
    boardRef.current?.measureInWindow((x, y, width) => {
      if (width > 0) boardFrame.current = { x, y, width };
    });
  };

  /** pageX → position in lanes (0 … 4). */
  const lanesForPageX = (pageX: number) => {
    const { x, width } = boardFrame.current;
    return Math.max(0, Math.min(4, ((pageX - x) / width) * 4));
  };
  const laneForX = (pageX: number): Lane => Math.min(3, Math.floor(lanesForPageX(pageX))) as Lane;

  const handleTouchStart = (e: GestureResponderEvent) => {
    for (const t of e.nativeEvent.changedTouches) {
      const id = String(t.identifier);
      if (touchLanes.current.has(id)) continue;
      const lane = laneForX(t.pageX);
      touchLanes.current.set(id, lane);
      fingerX.current.set(id, lanesForPageX(t.pageX));
      pressLane(lane, false, t.pageY - boardFrame.current.y);
    }
    emitFingers();
  };

  const handleTouchMove = (e: GestureResponderEvent) => {
    for (const t of e.nativeEvent.changedTouches) {
      const id = String(t.identifier);
      const prev = touchLanes.current.get(id);
      if (prev === undefined) continue;
      fingerX.current.set(id, lanesForPageX(t.pageX));
      const lane = laneForX(t.pageX);
      if (lane !== prev) {
        // Finger slid into another lane: release the old one, press the new one
        touchLanes.current.set(id, lane);
        if (![...touchLanes.current.values()].includes(prev)) releaseLane(prev);
        pressLane(lane, true, t.pageY - boardFrame.current.y);
      }
    }
    emitFingers();
  };

  const handleTouchEnd = (e: GestureResponderEvent) => {
    for (const t of e.nativeEvent.changedTouches) {
      const id = String(t.identifier);
      const lane = touchLanes.current.get(id);
      if (lane === undefined) continue;
      touchLanes.current.delete(id);
      fingerX.current.delete(id);
      // Only release if no other finger is still on this lane
      if (![...touchLanes.current.values()].includes(lane)) releaseLane(lane);
    }
    emitFingers();
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
              style={styles.laneColumn}
              disabled={USE_MULTI_TOUCH}
              onPressIn={
                USE_MULTI_TOUCH
                  ? undefined
                  : (e) => {
                      pressY.current = e.nativeEvent.locationY;
                      fingerX.current.set(`lane${laneIndex}`, laneIndex + 0.5);
                      pressLane(laneIndex, false, pressY.current ?? undefined);
                      emitFingers();
                    }
              }
              onPressOut={
                USE_MULTI_TOUCH
                  ? undefined
                  : () => {
                      fingerX.current.delete(`lane${laneIndex}`);
                      releaseLane(laneIndex);
                      emitFingers();
                    }
              }
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
