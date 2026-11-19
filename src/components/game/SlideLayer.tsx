/**
 * All slide tiles on iOS / Android, drawn in ONE Skia canvas that covers the
 * board. Each slide is a Group moved on the UI thread from the song clock, so a
 * slide scrolling in only adds a few paths — no new native canvas per tile
 * (creating those was what made slides stutter).
 *
 * Each slide is one thick stroke along its centre line, layered into a black
 * outline, a light rim, a navy body and a rail. Diagonals stay straight: the
 * ends are extended along the line and clipped flat, and the head is the bottom
 * part of that same stroke. (Web: SlideLayer.web.tsx draws nothing; the web
 * board uses the box-based SlideTileView instead.)
 */
import React, { memo, useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Canvas, Group, Path, Skia, rect, type SkPath } from '@shopify/react-native-skia';
import {
  Easing,
  cancelAnimation,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import type { ActiveTileState } from '../../types/game';
import type { TimedTile } from './TileField';
import { TILE_STATES } from './TapTileView';
import { FX_CELL, pixelCirclePath } from './pixelShapes';

/** Pixel shapes as Skia paths, built once per size and reused by every slide. */
const skPathCache = new Map<string, SkPath>();
function skPixel(radius: number, thickness?: number, half = false): SkPath {
  const key = `${radius}|${thickness ?? 'disc'}|${half}`;
  let p = skPathCache.get(key);
  if (!p) {
    p = Skia.Path.MakeFromSVGString(pixelCirclePath(radius, thickness, half)) ?? Skia.Path.Make();
    skPathCache.set(key, p);
  }
  return p;
}
const RING_FRAMES = [0.35, 0.6, 0.85, 1.1];
const RING_COLORS = ['#ffffff', '#FF6B4A', '#ff9a7f', '#4d8dff'];

/** Native: slides are drawn here, not by SlideTileView. */
export const SLIDES_IN_LAYER = true;

export const SLIDE_HEAD_HEIGHT = 36;
const CORAL = { base: '#FF6B4A', light: '#ffb39f', dark: '#a83a22' } as const;

type StrokeColors = { outline: string; rim: string; body: string; rail: string };
const COLORS = {
  normal: { outline: '#000000', rim: '#7aa4ff', body: '#123a9e', rail: '#4d8dff' },
  filled: { outline: '#000000', rim: '#d6e2ff', body: '#2f6bff', rail: '#FF6B4A' },
  missed: { outline: '#000000', rim: '#ff7a73', body: '#7d1411', rail: '#d8342f' },
} as const;

/** x of the polyline where it crosses height y (ys run bottom to top). Later points win on flat parts. */
export function xAtY(xs: number[], ys: number[], y: number): number {
  'worklet';
  let x = xs[0];
  for (let i = 1; i < xs.length; i++) {
    const y0 = ys[i - 1];
    const y1 = ys[i];
    if (y < y1) {
      x = xs[i];
      continue;
    }
    if (y <= y0) {
      x = y0 === y1 ? xs[i] : xs[i - 1] + ((y0 - y) / (y0 - y1)) * (xs[i] - xs[i - 1]);
      if (y0 !== y1) break;
    }
  }
  return x;
}

/** The four stacked strokes that make up a slide. */
function SlideStrokes({ path, width, colors }: { path: SkPath; width: number; colors: StrokeColors }) {
  return (
    <>
      <Path path={path} style="stroke" strokeWidth={width} strokeJoin="miter" strokeCap="butt" color={colors.outline} />
      <Path path={path} style="stroke" strokeWidth={width - 4} strokeJoin="miter" strokeCap="butt" color={colors.rim} />
      <Path path={path} style="stroke" strokeWidth={width - 12} strokeJoin="miter" strokeCap="butt" color={colors.body} />
      <Path path={path} style="stroke" strokeWidth={4} strokeJoin="miter" strokeCap="butt" color={colors.rail} opacity={0.75} />
    </>
  );
}

interface SlideShapeProps {
  tile: TimedTile;
  status: ActiveTileState['status'];
  holdProgress: number;
  holdStart?: number;
  songTime: SharedValue<number>;
  speed: number;
  hitLineY: number;
  pixelsPerBeat: number;
  laneWidth: number;
}

/** One slide, in its own coordinates (y = 0 at its top, `height` at its head). */
const SlideShape = memo(function SlideShape({
  tile,
  status,
  holdProgress,
  holdStart,
  songTime,
  speed,
  hitLineY,
  pixelsPerBeat,
  laneWidth,
}: SlideShapeProps) {
  const path = tile.path!;
  const height = tile.durationBeats * pixelsPerBeat;
  const boardWidth = laneWidth * 4;
  const strokeW = Math.max(16, laneWidth - 8); // a little gap to the lane edges
  const noteTime = tile.noteTime;

  const geo = useMemo(() => {
    const xs = path.map((pt) => (pt.x + 0.5) * laneWidth);
    const ys = path.map((pt) => height - pt.t * pixelsPerBeat);
    const half = strokeW / 2;
    // Extend an end along its segment far enough that the butt cap lies past the
    // clip line, so the end is cut flat instead of slanted. A flat (sideways)
    // end can't be extended vertically, so the clip makes room for it instead.
    const extend = (ax: number, ay: number, bx: number, by: number) => {
      const dx = ax - bx;
      const dy = ay - by;
      const len = Math.hypot(dx, dy) || 1;
      if (Math.abs(dy) < 0.01) return { x: ax, y: ay, extra: half };
      const L = Math.min(strokeW * 4, (half * Math.abs(dx)) / Math.abs(dy) + 2);
      return { x: ax + (dx / len) * L, y: ay + (dy / len) * L, extra: 0 };
    };
    const n = xs.length;
    const start = extend(xs[0], ys[0], xs[1], ys[1]);
    const end = extend(xs[n - 1], ys[n - 1], xs[n - 2], ys[n - 2]);
    const b = Skia.PathBuilder.Make();
    b.moveTo(start.x, start.y);
    for (let i = 0; i < n; i++) b.lineTo(xs[i], ys[i]);
    b.lineTo(end.x, end.y);
    const clipTop = -end.extra;
    const clipBottom = height + start.extra;
    return {
      xs,
      ys,
      path: b.build(),
      bottomExtra: start.extra,
      bodyClip: rect(0, clipTop, boardWidth, clipBottom - clipTop),
      headClip: rect(0, height - SLIDE_HEAD_HEIGHT, boardWidth, SLIDE_HEAD_HEIGHT + start.extra),
    };
  }, [path, laneWidth, pixelsPerBeat, height, strokeW, boardWidth]);

  // Head reaches the hit line exactly when songTime === noteTime
  const transform = useDerivedValue(() => [{ translateY: hitLineY - height - (noteTime - songTime.value) * speed }]);

  const isHolding = status === 'holding';
  const isHit = status === 'hit';
  const isMissed = status === 'missed';
  const live = isHolding && tile.durationSeconds > 0;
  const start = holdStart ?? noteTime;
  const staticProgress = isHit ? 1 : Math.min(1, Math.max(0, holdProgress));
  const progress = useDerivedValue(() =>
    live ? Math.min(1, Math.max(0, (songTime.value - start) / tile.durationSeconds)) : staticProgress
  );
  const fillClip = useDerivedValue(() => {
    const top = height - progress.value * height;
    return rect(0, top, boardWidth, height + geo.bottomExtra - top);
  });
  // "Follow me" marker where the line crosses the progress height: a pixel
  // orb (coral with a white core) with a thin pixel arc riding on top and a
  // fainter arc drifting up ahead. Everything is always mounted and only its
  // opacity changes, so starting a slide never rebuilds the canvas.
  const orbR = Math.max(FX_CELL * 3, Math.round(strokeW * 0.32));
  const arcR = orbR + FX_CELL * 2;
  const shapes = useMemo(
    () => ({
      orb: skPixel(orbR),
      core: skPixel(Math.round(orbR * 0.45)),
      arc: skPixel(arcR, FX_CELL, true),
      rings: RING_FRAMES.map((f) => skPixel(Math.round((strokeW / 2) * f), FX_CELL)),
    }),
    [orbR, arcR, strokeW]
  );
  const orbTransform = useDerivedValue(() => {
    const y = height - progress.value * height;
    return [{ translateX: Math.round(xAtY(geo.xs, geo.ys, y)) }, { translateY: Math.round(y) }];
  });
  const echo = useSharedValue(0);
  const ring = useSharedValue(1);
  useEffect(() => {
    if (live) echo.value = withRepeat(withTiming(1, { duration: 620, easing: Easing.out(Easing.quad) }), -1, false);
    else {
      cancelAnimation(echo);
      echo.value = 0;
    }
  }, [live, echo]);
  useEffect(() => {
    // Press: a pixel ring bursts out of the head (4 frames)
    if (isHolding) {
      ring.value = 0;
      ring.value = withTiming(1, { duration: 360, easing: Easing.linear });
    }
  }, [isHolding, ring]);
  const orbOpacity = useDerivedValue(() => (live ? 1 : 0));
  const echoTransform = useDerivedValue(() => [{ translateY: -Math.round((echo.value * arcR) / FX_CELL) * FX_CELL }]);
  const echoOpacity = useDerivedValue(() => (live ? 0.5 * (1 - echo.value) : 0));
  const ringFrame = useDerivedValue(() => (ring.value < 1 ? Math.floor(ring.value * RING_FRAMES.length) : -1));
  const ringOps = RING_FRAMES.map((_, i) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useDerivedValue(() => (ringFrame.value === i ? 1 : 0))
  );
  const headCenter = [{ translateX: Math.round(geo.xs[0]) }, { translateY: Math.round(height - SLIDE_HEAD_HEIGHT / 2) }];

  const head = isMissed ? TILE_STATES.missed : isHolding ? CORAL : isHit ? TILE_STATES.pressed : TILE_STATES.normal;
  const headColors: StrokeColors = { outline: '#000000', rim: head.light, body: head.base, rail: head.base };
  const showFill = !isMissed && (live || staticProgress > 0);

  return (
    <Group transform={transform}>
      <Group clip={geo.bodyClip}>
        <SlideStrokes path={geo.path} width={strokeW} colors={isMissed ? COLORS.missed : COLORS.normal} />
        {showFill ? (
          <Group clip={fillClip}>
            <SlideStrokes path={geo.path} width={strokeW} colors={COLORS.filled} />
          </Group>
        ) : null}
        {/* Head: the bottom of the same stroke, so it follows the slide's angle */}
        <Group clip={geo.headClip}>
          <SlideStrokes path={geo.path} width={strokeW} colors={headColors} />
        </Group>
      </Group>
      <Group transform={orbTransform} opacity={orbOpacity}>
        <Path path={shapes.orb} color="#FF6B4A" />
        <Path path={shapes.core} color="#ffffff" />
        <Group transform={echoTransform} opacity={echoOpacity}>
          <Path path={shapes.arc} color="#ffb39f" />
        </Group>
        <Path path={shapes.arc} color="#ffffff" />
      </Group>
      <Group transform={headCenter}>
        {shapes.rings.map((p, i) => (
          <Path key={i} path={p} color={RING_COLORS[i]} opacity={ringOps[i]} />
        ))}
      </Group>
    </Group>
  );
});

interface SlideLayerProps {
  /** Visible tiles (non-slides are ignored). */
  tiles: TimedTile[];
  getTileState: (id: string) => ActiveTileState | undefined;
  songTime: SharedValue<number>;
  speed: number;
  hitLineY: number;
  pixelsPerBeat: number;
  boardWidth: number;
  boardHeight: number;
  /** Bumped when a tile's status changes. */
  version: number;
}

export const SlideLayer = memo(function SlideLayer({
  tiles,
  getTileState,
  songTime,
  speed,
  hitLineY,
  pixelsPerBeat,
  boardWidth,
  boardHeight,
}: SlideLayerProps) {
  const slides = tiles.filter((t) => t.path && t.path.length >= 2 && t.durationBeats > 0);
  // Keep the canvas mounted for the whole song (even with no slides on screen)
  if (boardWidth <= 0 || boardHeight <= 0) return null;
  const laneWidth = boardWidth / 4;
  return (
    <View pointerEvents="none" style={[styles.layer, { width: boardWidth, height: boardHeight }]}>
      <Canvas style={StyleSheet.absoluteFill}>
        {slides.map((tile) => {
          const st = getTileState(tile.id);
          return (
            <SlideShape
              key={tile.id}
              tile={tile}
              status={st?.status ?? 'pending'}
              holdProgress={st?.holdProgress ?? 0}
              holdStart={st?.holdStartTime}
              songTime={songTime}
              speed={speed}
              hitLineY={hitLineY}
              pixelsPerBeat={pixelsPerBeat}
              laneWidth={laneWidth}
            />
          );
        })}
      </Canvas>
    </View>
  );
});

const styles = StyleSheet.create({
  layer: { position: 'absolute', top: 0, left: 0 },
});
