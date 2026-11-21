import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useScreenInsets } from './useScreenInsets';
import { BAR_OPACITY, C, alpha } from '../../theme/palette';

interface ScreenViewProps {
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  /**
   * Colour of the strip behind the camera cutout / notch at the top. By default
   * the same see-through tint as the Songs header and the tab bar, so the strip
   * and the header read as one bar with the animated background softly behind.
   */
  topBarColor?: string;
}

/**
 * Screen wrapper that pads the top and sides so content never sits under a
 * camera cutout, notch or rounded corner, and fills that top area with a solid
 * strip. The bottom is left to the tab bar, which applies its own inset.
 */
export function ScreenView({ style, children, topBarColor }: ScreenViewProps) {
  const insets = useScreenInsets();
  return (
    <View
      style={[
        { flex: 1, paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right },
        style,
      ]}
    >
      {insets.top > 0 ? (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top, backgroundColor: topBarColor ?? alpha(C.bg, BAR_OPACITY) }}
        />
      ) : null}
      {children}
    </View>
  );
}
