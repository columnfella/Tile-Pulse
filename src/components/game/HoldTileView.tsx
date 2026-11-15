import React, { memo, useEffect } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
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

const HEAD_HEIGHT = 40;
const BEVEL = PIXEL.unit;

/** Coral "being pressed" colours for the head. */
const CORAL = { base: '#FF6B4A', light: '#ffb39f', dark: '#a83a22' } as const;
/** Fill colours, top (leading edge) → bottom: coral → blue → navy. */
const FILL_GRADIENT = ['#FF6B4A', '#2f6bff', '#123a9e'] as const;
/** Resting body: deep navy → black. */
const BODY_GRADIENT = ['#0b1a40', '#05070d'] as const;

/** Live hold progress, computed on the UI thread from the song clock. */
export interface LiveHoldProgress {
  songTime: SharedValue<number>;
  start: number; // seconds
  duration: number; // seconds
}

/** The coloured fill plus a bright line marking how far you've held. */
function FillContents() {
  return (
    <>
      <LinearGradient colors={FILL_GRADIENT} style={StyleSheet.absoluteFill} />
      <View style={styles.fillEdge} />
    </>
  );
}

/** Fill that rises from the head as the note is held (UI thread). */
function LiveFill({ live }: { live: LiveHoldProgress }) {
  const { songTime, start, duration } = live;
  const style = useAnimatedStyle(() => {
    const p = duration > 0 ? (songTime.value - start) / duration : 1;
    return { height: `${Math.min(1, Math.max(0, p)) * 100}%` };
  });
  return (
    <Animated.View style={[styles.fill, style]}>
      <FillContents />
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
}: HoldTileViewProps) {
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

  if (theme.holdTile.imageSource) {
    return (
      <View pointerEvents="none" style={[styles.body, { top: y, height, opacity: isMissed ? 0.5 : 1 }]}>
        <Image source={theme.holdTile.imageSource} style={styles.sprite} resizeMode="stretch" />
      </View>
    );
  }

  const pressed = isHolding || isHit;
  const edge = isMissed ? TILE_STATES.missed : TILE_STATES.normal;
  const head = isMissed ? TILE_STATES.missed : isHolding ? CORAL : isHit ? TILE_STATES.pressed : TILE_STATES.normal;
  const progress = isHit ? 1 : Math.min(1, Math.max(0, holdProgress));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.body,
        {
          top: y,
          height,
          backgroundColor: isMissed ? `${edge.base}55` : '#05070d',
          // Pushed in while pressed: dark top/left, light bottom/right
          borderTopColor: pressed ? edge.dark : edge.light,
          borderLeftColor: pressed ? edge.dark : edge.light,
          borderBottomColor: pressed ? edge.light : edge.dark,
          borderRightColor: pressed ? edge.light : edge.dark,
        },
        tileStyle,
      ]}
    >
      {!isMissed && <LinearGradient colors={BODY_GRADIENT} style={StyleSheet.absoluteFill} />}

      {/* Coral → blue fill with a bright leading edge */}
      {!isMissed &&
        (isHolding && live ? (
          <LiveFill live={live} />
        ) : progress > 0 ? (
          <View style={[styles.fill, { height: `${progress * 100}%` }]}>
            <FillContents />
          </View>
        ) : null)}

      {/* Inner shadow across the top while pressed, for depth */}
      {pressed && !isMissed && (
        <LinearGradient colors={['#000000cc', '#00000000']} style={styles.innerShadow} pointerEvents="none" />
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
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  body: {
    position: 'absolute',
    left: 3,
    right: 3,
    borderWidth: BEVEL,
    overflow: 'hidden',
  },
  sprite: { width: '100%', height: '100%' },
  fill: { position: 'absolute', bottom: 0, left: 0, right: 0, overflow: 'hidden' },
  fillEdge: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: '#ffffff',
  },
  innerShadow: { position: 'absolute', top: 0, left: 0, right: 0, height: 18 },
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
  headGlow: { backgroundColor: '#ffffff' },
  headText: { fontFamily: FONTS.pixel, fontSize: 8, color: '#000000', letterSpacing: 1 },
  headTextHolding: { color: '#ffffff' },
});
