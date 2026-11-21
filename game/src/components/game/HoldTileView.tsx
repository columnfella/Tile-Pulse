import React, { memo, useEffect } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { ACTIVE_THEME, ThemeConfig } from '../../constants/theme';
import { FONTS, PIXEL } from '../../theme/pixel';
import { TILE_STATES } from './TapTileView';
import Svg, { Defs, LinearGradient as SvgGradient, Path, Stop } from 'react-native-svg';
import { FX_CELL, pixelCirclePath, pixelExtent } from './pixelShapes';

import { C } from '../../theme/palette';
const HEAD_HEIGHT = 40;
/** Height of the HOLD head (the part you must press to start the hold). */
export const HOLD_HEAD_HEIGHT = HEAD_HEIGHT;
const BEVEL = PIXEL.unit;

/** Width of a tile's slot inside its lane (3 px gap each side). */
export const TILE_INSET = 2;

/** Coral "being pressed" colours for the head. */
const CORAL = { base: C.accent, light: C.accentSoft, dark: C.accentDeep } as const;
/** Fill colours, top (leading edge) → bottom: coral → blue → navy. */
const FILL_GRADIENT = [C.accent, C.blueStrong, C.blueDark] as const;
/** Completed: the whole tile charges up to green. */
const DONE_GRADIENT = ['#b6ffd6', C.success, C.successDark] as const;
const DONE_MS = 650;
/** Resting body: deep navy → black. */
const BODY_GRADIENT = ['#0b1a40', C.bg] as const;

/** Live hold progress, computed on the UI thread from the song clock. */
export interface LiveHoldProgress {
  songTime: SharedValue<number>;
  start: number; // seconds
  duration: number; // seconds
}

/**
 * Pixel arc (top half of a pixel ring) drawn as one SVG path, with a stepped
 * coral → blue gradient. `radius` in px; the arc is FX_CELL thick.
 */
function PixelArc({ radius, light = false }: { radius: number; light?: boolean }) {
  const e = pixelExtent(radius);
  const d = pixelCirclePath(radius, FX_CELL, true);
  return (
    <Svg width={e * 2} height={e} viewBox={`${-e} ${-e} ${e * 2} ${e}`}>
      <Defs>
        <SvgGradient id="arc" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={light ? '#ffd2c5' : C.white} />
          <Stop offset="0.45" stopColor={light ? C.accentSoft : C.accent} />
          <Stop offset="1" stopColor={light ? C.bluePale : C.blue} />
        </SvgGradient>
      </Defs>
      <Path d={d} fill="url(#arc)" />
    </Svg>
  );
}

/**
 * The fill that rises as the note is held: a coral → blue → navy column with a
 * thin pixel arc riding its top edge and fainter pixel arcs drifting up ahead,
 * like a pulse. Driven on the UI thread from the song clock while holding
 * (`live`), or a fixed `progress`.
 */
function ArcFill({
  inner,
  live,
  progress,
  pulse,
}: {
  /** Inner width of the tile (px): the arc spans it. */
  inner: number;
  live?: LiveHoldProgress;
  progress: number;
  pulse: SharedValue<number>;
}) {
  const r = Math.max(FX_CELL * 3, inner / 2 - FX_CELL);
  const e = pixelExtent(r);
  const height = useAnimatedStyle(() => {
    let p = progress;
    if (live) p = live.duration > 0 ? (live.songTime.value - live.start) / live.duration : 1;
    return { height: `${Math.min(1, Math.max(0, p)) * 100}%` };
  });
  // Echo arcs: rise and fade ahead of the edge, on repeat while holding
  const echo = useSharedValue(0);
  useEffect(() => {
    if (live) echo.value = withRepeat(withTiming(1, { duration: 620, easing: Easing.out(Easing.quad) }), -1, false);
    else {
      cancelAnimation(echo);
      echo.value = 0;
    }
  }, [live, echo]);
  const arcStyle = useAnimatedStyle(() => ({ opacity: 0.6 + 0.4 * pulse.value }));
  // Echo moves in whole art pixels, so it stays crisp
  const echoStyle = useAnimatedStyle(() => ({
    opacity: live ? 0.5 * (1 - echo.value) : 0,
    transform: [{ translateY: -Math.round((echo.value * r) / FX_CELL) * FX_CELL }],
  }));
  const place = { top: -e, left: (inner - e * 2) / 2 };

  return (
    <Animated.View style={[styles.fill, height]}>
      <LinearGradient colors={FILL_GRADIENT} style={StyleSheet.absoluteFill} />
      <Animated.View style={[styles.arc, place, echoStyle]}>
        <PixelArc radius={r} light />
      </Animated.View>
      <Animated.View style={[styles.arc, place, arcStyle]}>
        <PixelArc radius={r} />
      </Animated.View>
    </Animated.View>
  );
}

/** Pixel ring frames for the press burst: small → big, coral → blue. */
const RING_FRAMES = [
  { scale: 0.35, color: C.textStrong },
  { scale: 0.6, color: C.accent },
  { scale: 0.85, color: '#ff9a7f' },
  { scale: 1.1, color: C.blue },
] as const;

/**
 * Ring that bursts out of the head the moment the hold is pressed, played as
 * four pixel-art frames (like a sprite animation) instead of a smooth scale.
 */
function PressRing({ inner }: { inner: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withTiming(1, { duration: 360, easing: Easing.linear });
  }, [t]);
  const base = Math.max(FX_CELL * 4, inner / 2);
  return (
    <>
      {RING_FRAMES.map((f, i) => (
        <RingFrame key={i} index={i} t={t} radius={Math.round(base * f.scale)} color={f.color} />
      ))}
    </>
  );
}

function RingFrame({ index, t, radius, color }: { index: number; t: SharedValue<number>; radius: number; color: string }) {
  const e = pixelExtent(radius);
  const style = useAnimatedStyle(() => {
    const frame = Math.min(RING_FRAMES.length - 1, Math.floor(t.value * RING_FRAMES.length));
    return { opacity: t.value < 1 && frame === index ? 1 : 0 };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.ring, { width: e * 2, height: e * 2, marginLeft: -e, bottom: HEAD_HEIGHT / 2 - e }, style]}
    >
      <Svg width={e * 2} height={e * 2} viewBox={`${-e} ${-e} ${e * 2} ${e * 2}`}>
        <Path d={pixelCirclePath(radius, FX_CELL)} fill={color} />
      </Svg>
    </Animated.View>
  );
}

interface HoldTileViewProps {
  y: number;
  height: number;
  lane: 0 | 1 | 2 | 3;
  isHolding?: boolean;
  holdProgress?: number; // 0.0 to 1.0
  isHit?: boolean;
  isMissed?: boolean;
  theme?: ThemeConfig;
  /** When holding, animate the fill on the UI thread instead of via re-renders. */
  live?: LiveHoldProgress;
  /** Width of the tile's slot in px (lane width minus the gaps); shapes the arc. */
  width?: number;
}

/**
 * Pixel-art hold tile with a physical "press" feel:
 *  - Waiting: navy→black body, blue bevel, blue HOLD head.
 *  - Holding: the tile squeezes in, the head sinks and turns coral with a
 *    gentle pulse, and a coral→blue fill rises with a bright leading edge.
 *  - Completed: fully filled. Missed: red.
 */
export const HoldTileView = memo(function HoldTileView({
  y,
  height,
  isHolding = false,
  holdProgress = 0,
  isHit = false,
  isMissed = false,
  theme = ACTIVE_THEME,
  live,
  width = 80,
}: HoldTileViewProps) {
  const inner = Math.max(12, width - 2 * BEVEL);
  // Press amount (springy) and the pulse while held — both UI thread
  const press = useSharedValue(isHolding ? 1 : 0);
  const pulse = useSharedValue(0);

  useEffect(() => {
    press.value = withSpring(isHolding ? 1 : 0, { damping: 13, stiffness: 320, mass: 0.6 });
    if (isHolding) {
      pulse.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 200, easing: Easing.out(Easing.quad) }),
          withTiming(0.3, { duration: 220, easing: Easing.in(Easing.quad) })
        ),
        -1
      );
    } else {
      cancelAnimation(pulse);
      pulse.value = withTiming(0, { duration: 150 });
    }
  }, [isHolding, press, pulse]);

  const tileStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: 1 - 0.07 * press.value }],
  }));
  const headStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: 3 * press.value }, { scaleY: 1 - 0.12 * press.value }],
  }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: 0.55 * pulse.value }));

  // Completion: 0 → 1 once when a hold is finished (already-finished tiles start at 1)
  const done = useSharedValue(isHit ? 1 : 0);
  useEffect(() => {
    if (isHit) done.value = withTiming(1, { duration: DONE_MS, easing: Easing.out(Easing.quad) });
    else done.value = 0;
  }, [isHit, done]);
  // Green sweeps up from the head, a white flash, then a shine runs up the tile
  const doneFillStyle = useAnimatedStyle(() => ({
    height: `${interpolate(done.value, [0, 0.45, 1], [0, 100, 100], 'clamp')}%`,
  }));
  const doneFlashStyle = useAnimatedStyle(() => ({
    opacity: interpolate(done.value, [0, 0.4, 0.55, 1], [0, 0, 0.75, 0], 'clamp'),
  }));
  const shineStyle = useAnimatedStyle(() => ({
    opacity: done.value > 0.45 && done.value < 1 ? 0.7 : 0,
    transform: [{ translateY: interpolate(done.value, [0.45, 1], [height, -28], 'clamp') }],
  }));
  // Completion "breath": a brightness swell, never wider than the lane
  const doneBodyStyle = useAnimatedStyle(() => ({
    opacity: interpolate(done.value, [0, 0.5, 0.75, 1], [1, 1, 0.85, 1]),
  }));

  if (theme.holdTile.imageSource) {
    return (
      <View pointerEvents="none" style={[styles.body, { top: y, height, opacity: isMissed ? 0.5 : 1 }]}>
        <Image source={theme.holdTile.imageSource} style={styles.sprite} resizeMode="stretch" />
      </View>
    );
  }

  const pressed = isHolding || isHit;
  const edge = isMissed ? TILE_STATES.missed : TILE_STATES.normal;
  const head = isMissed ? TILE_STATES.missed : isHolding ? CORAL : isHit ? TILE_STATES.hit : TILE_STATES.normal;
  const progress = isHit ? 1 : Math.min(1, Math.max(0, holdProgress));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.body,
        {
          top: y,
          height,
          backgroundColor: isMissed ? `${edge.base}55` : C.bg,
          // Pushed in while pressed: dark top/left, light bottom/right
          borderTopColor: pressed ? edge.dark : edge.light,
          borderLeftColor: pressed ? edge.dark : edge.light,
          borderBottomColor: pressed ? edge.light : edge.dark,
          borderRightColor: pressed ? edge.light : edge.dark,
        },
        isHit ? doneBodyStyle : tileStyle,
      ]}
    >
      {!isMissed && <LinearGradient colors={BODY_GRADIENT} style={StyleSheet.absoluteFill} />}

      {/* Rising coral → blue fill with a semicircular, glowing leading edge */}
      {!isMissed && ((isHolding && live) || progress > 0) ? (
        <ArcFill inner={inner} live={isHolding ? live : undefined} progress={progress} pulse={pulse} />
      ) : null}


      {/* Completed: green charge-up, flash and a shine running up the tile */}
      {isHit && !isMissed && (
        <>
          <Animated.View style={[styles.fill, doneFillStyle]}>
            <LinearGradient colors={DONE_GRADIENT} style={StyleSheet.absoluteFill} />
          </Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, styles.headGlow, doneFlashStyle]} />
          <Animated.View style={[styles.shine, shineStyle]} />
        </>
      )}


      {/* Bevelled head: sinks, squashes and pulses while held */}
      <Animated.View
        style={[
          styles.head,
          {
            backgroundColor: head.base,
            borderTopColor: isHolding ? head.dark : head.light,
            borderLeftColor: isHolding ? head.dark : head.light,
            borderBottomColor: isHolding ? head.light : head.dark,
            borderRightColor: isHolding ? head.light : head.dark,
          },
          headStyle,
        ]}
      >
        {isHolding && <Animated.View style={[StyleSheet.absoluteFill, styles.headGlow, glowStyle]} />}
        <Text style={[styles.headText, isHolding && styles.headTextHolding]}>HOLD</Text>
      </Animated.View>

      {/* The press: a ring bursts out of the head (drawn over it) */}
      {isHolding && !isMissed ? <PressRing inner={inner} /> : null}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  body: {
    position: 'absolute',
    left: TILE_INSET,
    right: TILE_INSET,
    borderWidth: BEVEL,
    overflow: 'hidden',
  },
  sprite: { width: '100%', height: '100%' },
  // No overflow clipping: the pixel arc sits just above the fill's top edge
  fill: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  arc: { position: 'absolute' },
  ring: { position: 'absolute', left: '50%' },
  head: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: HEAD_HEIGHT - BEVEL,
    borderWidth: BEVEL,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  headGlow: { backgroundColor: C.white },
  shine: { position: 'absolute', top: 0, left: 0, right: 0, height: 28, backgroundColor: C.white },
  headText: { fontFamily: FONTS.pixel, fontSize: 8, color: C.onAccent, letterSpacing: 1 },
  headTextHolding: { color: C.textStrong },
});
