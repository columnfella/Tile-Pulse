import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { ACTIVE_THEME, ThemeConfig } from '../../constants/theme';

interface HoldTileViewProps {
  y: number;
  height: number;
  lane: 0 | 1 | 2 | 3;
  isHolding?: boolean;
  holdProgress?: number; // 0.0 to 1.0
  isHit?: boolean;
  isMissed?: boolean;
  theme?: ThemeConfig;
}

/**
 * React Native Decoupled Hold Tile Component
 * Renders both unheld body and active dynamic filling state as it passes the hit line.
 * Reads visual configuration exclusively from ACTIVE_THEME.
 */
export const HoldTileView: React.FC<HoldTileViewProps> = ({
  y,
  height,
  lane,
  isHolding = false,
  holdProgress = 0,
  isHit = false,
  isMissed = false,
  theme = ACTIVE_THEME,
}) => {
  const { holdTile, geometry } = theme;

  if (isHit && holdProgress >= 1) {
    return null;
  }

  // Custom sprite hook
  if (holdTile.imageSource) {
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
          source={holdTile.imageSource}
          style={[styles.sprite, { borderRadius: geometry.tileBorderRadius }]}
          resizeMode="cover"
        />
      </View>
    );
  }

  const clampedProgress = Math.min(1, Math.max(0, holdProgress));
  const fillPercentage = clampedProgress * 100;

  return (
    <View
      pointerEvents="none"
      style={[
        styles.container,
        {
          top: y,
          height: height,
          borderRadius: geometry.tileBorderRadius,
          backgroundColor: holdTile.bodyColor,
          borderColor: isHolding ? '#38bdf8' : isMissed ? '#64748b' : holdTile.bodyBorderColor,
          borderWidth: geometry.borderWidth,
          opacity: isMissed ? 0.35 : 1,
        },
      ]}
    >
      {/* Dynamic Active Hold Filling Bar (fills upward from bottom head cap as player holds) */}
      <View
        style={[
          styles.activeFillBar,
          {
            height: `${fillPercentage}%`,
            backgroundColor: holdTile.activeFillColor,
            opacity: isHolding ? 0.9 : 0.45,
          },
        ]}
      />

      {/* Trailing Tail Cap (at the top) */}
      <View
        style={[
          styles.tailCap,
          {
            backgroundColor: holdTile.tailColor,
          },
        ]}
      />

      {/* Leading Edge / Head Cap (The initial tap hit target at the bottom) */}
      <View
        style={[
          styles.headCap,
          {
            backgroundColor: isHolding ? '#0284c7' : isMissed ? '#475569' : holdTile.headColor,
          },
        ]}
      >
        <Text style={styles.headText}>HOLD</Text>
        {isHolding && (
          <Text style={styles.progressText}>
            {Math.round(clampedProgress * 100)}%
          </Text>
        )}
      </View>
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
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 3,
  },
  sprite: {
    width: '100%',
    height: '100%',
  },
  activeFillBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  tailCap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.2)',
  },
  headCap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.3)',
  },
  headText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
  },
  progressText: {
    color: '#bae6fd',
    fontSize: 10,
    fontWeight: 'bold',
    marginLeft: 4,
  },
});
