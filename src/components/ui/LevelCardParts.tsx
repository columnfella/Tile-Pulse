/**
 * Shared pieces of the level card used by Discover and the Songs tab:
 * the fading cover banner and the pixel difficulty/level badge.
 */
import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { PixelIcon, type PixelIconName } from './PixelIcon';
import { FONTS, PIXEL } from '../../theme/pixel';

export type Difficulty = 'easy' | 'normal' | 'hard' | 'expert';

export const DIFFICULTY_COLOR: Record<Difficulty, string> = {
  easy: '#9cc0ff',
  normal: '#4d8dff',
  hard: '#2f6bff',
  expert: PIXEL.accent,
};

/** Cover picture behind the top of a card: fades in once loaded and fades out into the card. */
export function CoverBanner({ uri, tall = false }: { uri: string; tall?: boolean }) {
  const opacity = useSharedValue(0);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <View style={[styles.coverBanner, tall && styles.coverBannerTall]} pointerEvents="none">
      <Animated.View style={[StyleSheet.absoluteFill, style]}>
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          onLoad={() => (opacity.value = withTiming(1, { duration: 500 }))}
        />
      </Animated.View>
      <LinearGradient
        colors={['rgba(11,18,32,0)', 'rgba(11,18,32,0.6)', PIXEL.panel]}
        locations={[0.3, 0.72, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

/** Square pixel badge with the level number, tinted by difficulty. */
export function LevelBadge({ level, difficulty }: { level: number; difficulty: Difficulty }) {
  const color = DIFFICULTY_COLOR[difficulty];
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <View style={[styles.badgeTop, { backgroundColor: color }]}>
        <Text style={styles.badgeTopText}>{difficulty.slice(0, 3).toUpperCase()}</Text>
      </View>
      <Text style={[styles.badgeLevel, { color }]}>{level}</Text>
    </View>
  );
}

/** Same badge shape with a label + icon (for songs that aren't community levels). */
export function IconBadge({ label, icon, color = PIXEL.accent2 }: { label: string; icon: PixelIconName; color?: string }) {
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <View style={[styles.badgeTop, { backgroundColor: color }]}>
        <Text style={styles.badgeTopText}>{label}</Text>
      </View>
      <View style={styles.badgeIcon}>
        <PixelIcon name={icon} size={14} color={color} />
      </View>
    </View>
  );
}

export const cardPartStyles = StyleSheet.create({
  /** Push the card's content below the top of the cover. */
  overCover: { marginTop: 44 },
});

const styles = StyleSheet.create({
  coverBanner: { position: 'absolute', top: 0, left: 0, right: 0, height: 96 },
  coverBannerTall: { height: 150 },
  badge: { width: 46, height: 46, borderWidth: 2, backgroundColor: '#070b14', alignItems: 'center' },
  badgeTop: { alignSelf: 'stretch', alignItems: 'center', paddingVertical: 2 },
  badgeTopText: { color: '#000000', fontFamily: FONTS.pixel, fontSize: 6 },
  badgeLevel: { fontFamily: FONTS.pixel, fontSize: 13, marginTop: 5 },
  badgeIcon: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
