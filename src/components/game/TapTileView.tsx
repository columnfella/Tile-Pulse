import React, { memo, useEffect } from 'react';
import { View, StyleSheet, Image } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { ACTIVE_THEME, ThemeConfig } from '../../constants/theme';
import { PIXEL } from '../../theme/pixel';

interface TapTileViewProps {
  y: number;
  height: number;
  lane: 0 | 1 | 2 | 3;
  isHit?: boolean;
  isMissed?: boolean;
  theme?: ThemeConfig;
}

/** Colours for each tile state: base fill + bevel highlight/shadow. */
export const TILE_STATES = {
  normal: { base: '#2f6bff', light: '#7aa4ff', dark: '#163fa8' },
  // Pressed like a button: darker, with the bevel flipped (pushed in) — used by hold / slide heads
  pressed: { base: '#163a8f', light: '#0c2260', dark: '#3f6fd6' },
  // A tapped tile turns green
  hit: { base: '#22c46e', light: '#8af5b8', dark: '#0f7a43' },
  // Missed: turns red as it scrolls off the screen
  missed: { base: '#d8342f', light: '#ff7a73', dark: '#7d1411' },
} as const;

const BEVEL = PIXEL.unit;
const HIT_MS = 260;

/**
 * Pixel-art tap tile drawn as a single View: the bevel is made with per-side
 * border colours (light top/left, dark bottom/right). On a hit it turns green
 * with a small press "squash", a white flash and a thin ring that fades out.
 */
export const TapTileView = memo(function TapTileView({
  y,
  height,
  isHit = false,
  isMissed = false,
  theme = ACTIVE_THEME,
}: TapTileViewProps) {
  // 0 → 1 once when the tile is hit
  const pop = useSharedValue(isHit ? 1 : 0);
  useEffect(() => {
    if (isHit) pop.value = withTiming(1, { duration: HIT_MS, easing: Easing.out(Easing.cubic) });
    else pop.value = 0;
  }, [isHit, pop]);

  const tileStyle = useAnimatedStyle(() => ({
    // Quick dip to 92% and back
    transform: [{ scale: interpolate(pop.value, [0, 0.35, 1], [1, 0.92, 1]) }],
  }));
  const flashStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pop.value, [0, 0.05, 1], [0, 0.65, 0]),
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: pop.value > 0 && pop.value < 1 ? interpolate(pop.value, [0, 1], [0.9, 0]) : 0,
    // Grows only vertically: a wider ring would poke into the neighbouring lanes
    transform: [{ scaleY: interpolate(pop.value, [0, 1], [1, 1.2]) }],
  }));

  if (theme.tapTile.imageSource) {
    return (
      <View pointerEvents="none" style={[styles.tile, { top: y, height, opacity: isMissed ? 0.5 : 1 }]}>
        <Image source={theme.tapTile.imageSource} style={styles.sprite} resizeMode="stretch" />
      </View>
    );
  }

  const c = isMissed ? TILE_STATES.missed : isHit ? TILE_STATES.hit : TILE_STATES.normal;

  return (
    <>
      {isHit ? <Animated.View pointerEvents="none" style={[styles.ring, { top: y, height }, ringStyle]} /> : null}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.tile,
          {
            top: y,
            height,
            backgroundColor: c.base,
            borderTopColor: c.light,
            borderLeftColor: c.light,
            borderBottomColor: c.dark,
            borderRightColor: c.dark,
          },
          tileStyle,
        ]}
      >
        {isHit ? <Animated.View style={[styles.flash, flashStyle]} /> : null}
      </Animated.View>
    </>
  );
});

const styles = StyleSheet.create({
  tile: {
    position: 'absolute',
    left: 3,
    right: 3,
    borderWidth: BEVEL,
  },
  flash: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#ffffff' },
  ring: {
    position: 'absolute',
    left: 3,
    right: 3,
    borderWidth: 2,
    borderColor: TILE_STATES.hit.light,
  },
  sprite: { width: '100%', height: '100%' },
});
