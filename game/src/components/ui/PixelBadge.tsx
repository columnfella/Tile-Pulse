/**
 * Small red count badge in the pixel style: square, hard outline, pixel font.
 * Used on the Social tab icon and its FRIENDS / INBOX buttons.
 */
import React from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { badgeText } from '../../services/socialCounts';
import { FONTS } from '../../theme/pixel';
import { C, themedStyles } from '../../theme/palette';

export function PixelBadge({ count, style }: { count: number; style?: StyleProp<ViewStyle> }) {
  if (count <= 0) return null;
  return (
    <View style={[styles.badge, style]} accessibilityLabel={`${count} new`} pointerEvents="none">
      <Text style={styles.text}>{badgeText(count)}</Text>
    </View>
  );
}

const styles = themedStyles(() => ({
  badge: {
    minWidth: 17,
    height: 17,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.error,
    borderWidth: 2,
    borderColor: C.outline,
    // Hard pixel drop shadow
    shadowColor: C.outline,
    shadowOffset: { width: 1, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  text: { color: '#ffffff', fontFamily: FONTS.pixel, fontSize: 7, lineHeight: 9, includeFontPadding: false },
}));
