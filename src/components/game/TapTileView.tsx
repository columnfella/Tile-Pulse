import React from 'react';
import { View, StyleSheet, Image } from 'react-native';
import { ACTIVE_THEME, ThemeConfig } from '../../constants/theme';

interface TapTileViewProps {
  y: number;
  height: number;
  lane: 0 | 1 | 2 | 3;
  isHit?: boolean;
  isMissed?: boolean;
  theme?: ThemeConfig;
}

/**
 * React Native Decoupled Tap Tile Component
 * Reads visual configuration exclusively from ACTIVE_THEME.
 * If imageSource is defined, renders Image; otherwise renders clean sample texture.
 */
export const TapTileView: React.FC<TapTileViewProps> = ({
  y,
  height,
  lane,
  isHit = false,
  isMissed = false,
  theme = ACTIVE_THEME,
}) => {
  const { tapTile, geometry } = theme;

  if (isHit) {
    return null;
  }

  // Custom sprite hook
  if (tapTile.imageSource) {
    return (
      <View
        pointerEvents="none"
        style={[
          styles.container,
          {
            top: y,
            height: height,
            borderRadius: geometry.tileBorderRadius,
            opacity: isMissed ? 0.35 : 1,
          },
        ]}
      >
        <Image
          source={tapTile.imageSource}
          style={[styles.sprite, { borderRadius: geometry.tileBorderRadius }]}
          resizeMode="cover"
        />
      </View>
    );
  }

  // Sample Texture: Clean geometric modern dark tile with neon accent edge & glossy shine
  return (
    <View
      pointerEvents="none"
      style={[
        styles.container,
        {
          top: y,
          height: height,
          borderRadius: geometry.tileBorderRadius,
          backgroundColor: tapTile.solidColor,
          borderColor: isMissed ? '#64748b' : tapTile.borderColor,
          borderWidth: geometry.borderWidth,
          opacity: isMissed ? 0.35 : 1,
        },
      ]}
    >
      {/* Top Gloss Highlight Bar */}
      <View style={styles.topGloss} />

      {/* Center Subtle Geometric Watermark */}
      <View style={styles.watermarkContainer}>
        <View style={[styles.watermarkDiamond, { borderColor: tapTile.borderColor }]} />
      </View>

      {/* Bottom Leading Edge Indicator (The Hit Anchor) */}
      <View
        style={[
          styles.hitAnchor,
          {
            backgroundColor: isMissed ? '#94a3b8' : tapTile.accentBarColor,
          },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 4,
    right: 4,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 6,
    elevation: 4,
  },
  sprite: {
    width: '100%',
    height: '100%',
  },
  topGloss: {
    width: '100%',
    height: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  watermarkContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.25,
  },
  watermarkDiamond: {
    width: 24,
    height: 24,
    borderWidth: 1,
    transform: [{ rotate: '45deg' }],
  },
  hitAnchor: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 6,
  },
});
