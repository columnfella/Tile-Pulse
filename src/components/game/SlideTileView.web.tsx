import React, { memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import type { SlidePoint } from '../../types/song';
import { slideOutline, slideStrips, slideXAt } from '../../game/engine';
import { FONTS, PIXEL } from '../../theme/pixel';
import { TILE_STATES } from './TapTileView';
import { SLIDE_COLORS, SlideBody } from './SlideBody';

/** Height of one pixel-art step of the slide body. */
const STEP = PIXEL.unit * 2;
const BEVEL = PIXEL.unit;
const HEAD_HEIGHT = 36;
const LANE = 25; // % of the board per lane
const CORAL = { base: '#FF6B4A', light: '#ffb39f', dark: '#a83a22' } as const;

export interface LiveSlideProgress {
  songTime: SharedValue<number>;
  start: number; // song time the slide was pressed (s)
  duration: number; // seconds
}

interface SlideTileViewProps {
  id?: string;
  path: SlidePoint[];
  /** Px per lane (layout uses percentages, so this is informational). */
  laneWidth?: number;
  durationBeats: number;
  pixelsPerBeat: number;
  /** Total height in px (durationBeats × pixelsPerBeat). */
  height: number;
  isHolding: boolean;
  holdProgress: number;
  isHit: boolean;
  isMissed: boolean;
  live?: LiveSlideProgress;
}

/**
 * Slide tile: pixel-art steps that follow the path across the lanes, with a
 * continuous bevel and a rail down the middle. Press the head (bottom); while
 * you follow it, a fill rises along the path and a coral marker shows where
 * your finger should be.
 */
export const SlideTileView = memo(function SlideTileView({
  path,
  durationBeats,
  pixelsPerBeat,
  height,
  isHolding,
  holdProgress,
  isHit,
  isMissed,
  live,
}: SlideTileViewProps) {
  const strips = useMemo(() => slideStrips(path, durationBeats, pixelsPerBeat, STEP), [path, durationBeats, pixelsPerBeat]);
  const edges = useMemo(() => slideOutline(strips), [strips]);
  const total = durationBeats * pixelsPerBeat;
  const progress = isHit ? 1 : Math.min(1, Math.max(0, holdProgress));
  const head = isMissed ? TILE_STATES.missed : isHolding ? CORAL : isHit ? TILE_STATES.pressed : TILE_STATES.normal;

  const fillStyle = useAnimatedStyle(() => {
    const p = live ? Math.min(1, Math.max(0, (live.songTime.value - live.start) / live.duration)) : progress;
    return { height: p * total };
  });
  const markerStyle = useAnimatedStyle(() => {
    const p = live ? Math.min(1, Math.max(0, (live.songTime.value - live.start) / live.duration)) : progress;
    return { left: `${slideXAt(path, p * durationBeats) * LANE}%`, bottom: Math.max(0, p * total - 8) };
  });

  return (
    <View pointerEvents="none" style={[styles.root, { height }]}>
      <View style={[styles.layer, { height: total }]}>
        <SlideBody strips={strips} edges={edges} colors={isMissed ? SLIDE_COLORS.missed : SLIDE_COLORS.normal} bevel={BEVEL} />
      </View>

      {/* Fill rising along the path while held (clipped from the bottom) */}
      {!isMissed && (live || progress > 0) ? (
        <Animated.View style={[styles.fillClip, fillStyle]}>
          <View style={[styles.layer, styles.fillInner, { height: total }]}>
            <SlideBody strips={strips} edges={edges} colors={SLIDE_COLORS.filled} bevel={BEVEL} />
          </View>
        </Animated.View>
      ) : null}

      {/* Where to keep your finger */}
      {live ? <Animated.View style={[styles.marker, markerStyle]} /> : null}

      {/* Head: where you press */}
      <View
        style={[
          styles.head,
          {
            left: `${path[0].x * LANE}%`,
            backgroundColor: head.base,
            borderTopColor: isHolding ? head.dark : head.light,
            borderLeftColor: isHolding ? head.dark : head.light,
            borderBottomColor: isHolding ? head.light : head.dark,
            borderRightColor: isHolding ? head.light : head.dark,
          },
        ]}
      >
        <Text style={[styles.headText, isHolding && styles.headTextHolding]}>SLIDE</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0 },
  layer: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  fillClip: { position: 'absolute', left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  fillInner: { bottom: 0 },
  marker: {
    position: 'absolute',
    width: `${LANE}%`,
    height: 16,
    backgroundColor: CORAL.base,
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  head: {
    position: 'absolute',
    bottom: 0,
    width: `${LANE}%`,
    height: HEAD_HEIGHT,
    borderWidth: BEVEL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headText: { fontFamily: FONTS.pixel, fontSize: 7, color: '#000000' },
  headTextHolding: { color: '#ffffff' },
});
