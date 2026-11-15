import React, { memo } from 'react';
import { View, StyleSheet, Image } from 'react-native';
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
  // Pressed like a button: darker, with the bevel flipped (pushed in)
  pressed: { base: '#163a8f', light: '#0c2260', dark: '#3f6fd6' },
  // Missed: turns red as it scrolls off the screen
  missed: { base: '#d8342f', light: '#ff7a73', dark: '#7d1411' },
} as const;

const BEVEL = PIXEL.unit;

/**
 * Pixel-art tap tile drawn as a single View: the bevel is made with per-side
 * border colours (light top/left, dark bottom/right). One view per tile keeps
 * mounting cheap during gameplay.
 */
export const TapTileView = memo(function TapTileView({
  y,
  height,
  isHit = false,
  isMissed = false,
  theme = ACTIVE_THEME,
}: TapTileViewProps) {
  if (theme.tapTile.imageSource) {
    return (
      <View pointerEvents="none" style={[styles.tile, { top: y, height, opacity: isMissed ? 0.5 : 1 }]}>
        <Image source={theme.tapTile.imageSource} style={styles.sprite} resizeMode="stretch" />
      </View>
    );
  }

  const c = isMissed ? TILE_STATES.missed : isHit ? TILE_STATES.pressed : TILE_STATES.normal;

  return (
    <View
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
      ]}
    />
  );
});

const styles = StyleSheet.create({
  tile: {
    position: 'absolute',
    left: 3,
    right: 3,
    borderWidth: BEVEL,
  },
  sprite: { width: '100%', height: '100%' },
});
