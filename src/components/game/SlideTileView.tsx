/**
 * Slide tile (iOS / Android), drawn with Skia as one smooth path: a thick
 * stroke along the slide's centre line, layered into a black outline, a light
 * rim, a navy body and a rail. Corners are mitred, so sideways moves and bends
 * get clean square corners at any angle. (Web version: SlideTileView.web.tsx.)
 */
import React, { memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Canvas, Group, Path, Rect, Skia, rect, type SkPath } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import type { SlidePoint } from '../../types/song';
import { slideXAt } from '../../game/engine';
import { FONTS, PIXEL } from '../../theme/pixel';
import { TILE_STATES } from './TapTileView';

const HEAD_HEIGHT = 36;
const LANE = 25; // % of the board per lane
const CORAL = { base: '#FF6B4A', light: '#ffb39f', dark: '#a83a22' } as const;

const COLORS = {
  normal: { outline: '#000000', rim: '#7aa4ff', body: '#123a9e', rail: '#4d8dff' },
  filled: { outline: '#000000', rim: '#d6e2ff', body: '#2f6bff', rail: '#FF6B4A' },
  missed: { outline: '#000000', rim: '#ff7a73', body: '#7d1411', rail: '#d8342f' },
} as const;

export interface LiveSlideProgress {
  songTime: SharedValue<number>;
  start: number; // song time the slide was pressed (s)
  duration: number; // seconds
}

interface SlideTileViewProps {
  id?: string;
  path: SlidePoint[];
  /** Width of one lane in px. */
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

/** The four stacked strokes that make up the slide body. */
function SlideStrokes({
  path,
  laneWidth,
  colors,
}: {
  path: SkPath;
  laneWidth: number;
  colors: (typeof COLORS)[keyof typeof COLORS];
}) {
  const w = laneWidth - 8; // a little gap to the lane edges
  return (
    <>
      <Path path={path} style="stroke" strokeWidth={w} strokeJoin="miter" strokeCap="butt" color={colors.outline} />
      <Path path={path} style="stroke" strokeWidth={w - 4} strokeJoin="miter" strokeCap="butt" color={colors.rim} />
      <Path path={path} style="stroke" strokeWidth={w - 12} strokeJoin="miter" strokeCap="butt" color={colors.body} />
      <Path path={path} style="stroke" strokeWidth={4} strokeJoin="miter" strokeCap="butt" color={colors.rail} opacity={0.75} />
    </>
  );
}

export const SlideTileView = memo(function SlideTileView({
  path,
  laneWidth = 0,
  durationBeats,
  pixelsPerBeat,
  height,
  isHolding,
  holdProgress,
  isHit,
  isMissed,
  live,
}: SlideTileViewProps) {
  // The canvas reaches half a lane above/below the tile so sideways parts at the ends aren't cut off
  const padV = laneWidth / 2;
  const boardWidth = laneWidth * 4;
  const canvasH = height + padV * 2;
  const total = durationBeats * pixelsPerBeat;

  const skPath = useMemo(() => {
    const p = Skia.PathBuilder.Make();
    path.forEach((pt, i) => {
      const x = (pt.x + 0.5) * laneWidth;
      const y = padV + height - pt.t * pixelsPerBeat;
      if (i === 0) p.moveTo(x, y);
      else p.lineTo(x, y);
    });
    return p.build();
  }, [path, laneWidth, padV, height, pixelsPerBeat]);

  const staticProgress = isHit ? 1 : Math.min(1, Math.max(0, holdProgress));
  const progress = useDerivedValue(() =>
    live ? Math.min(1, Math.max(0, (live.songTime.value - live.start) / live.duration)) : staticProgress
  );
  // Fill: everything below the current progress line (plus the bottom padding)
  const clip = useDerivedValue(() => {
    const top = padV + height - progress.value * total;
    return rect(0, top, boardWidth, canvasH - top);
  });
  // "Follow me" marker at the current point of the path
  const markerX = useDerivedValue(() => (slideXAt(path, progress.value * durationBeats) + 0.5) * laneWidth - 10);
  const markerY = useDerivedValue(() => padV + height - progress.value * total - 10);
  const markerInnerX = useDerivedValue(() => markerX.value + 3);
  const markerInnerY = useDerivedValue(() => markerY.value + 3);

  if (laneWidth <= 0) return null;
  const head = isMissed ? TILE_STATES.missed : isHolding ? CORAL : isHit ? TILE_STATES.pressed : TILE_STATES.normal;
  const showFill = !isMissed && (live || staticProgress > 0);

  return (
    <View pointerEvents="none" style={[styles.root, { height }]}>
      <Canvas style={[styles.canvas, { top: -padV, width: boardWidth, height: canvasH }]}>
        <SlideStrokes path={skPath} laneWidth={laneWidth} colors={isMissed ? COLORS.missed : COLORS.normal} />
        {showFill ? (
          <Group clip={clip}>
            <SlideStrokes path={skPath} laneWidth={laneWidth} colors={COLORS.filled} />
          </Group>
        ) : null}
        {live ? (
          <>
            <Rect x={markerX} y={markerY} width={20} height={20} color="#ffffff" />
            <Rect
              x={markerInnerX}
              y={markerInnerY}
              width={14}
              height={14}
              color={CORAL.base}
            />
          </>
        ) : null}
      </Canvas>

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
  canvas: { position: 'absolute', left: 0 },
  head: {
    position: 'absolute',
    bottom: 0,
    width: `${LANE}%`,
    height: HEAD_HEIGHT,
    marginLeft: 0,
    borderWidth: PIXEL.unit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headText: { fontFamily: FONTS.pixel, fontSize: 7, color: '#000000' },
  headTextHolding: { color: '#ffffff' },
});
