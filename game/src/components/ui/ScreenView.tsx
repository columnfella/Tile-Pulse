import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useScreenInsets } from './useScreenInsets';
import { PIXEL } from '../../theme/pixel';

interface ScreenViewProps {
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  /**
   * Colour of the strip behind the camera cutout / notch at the top. Solid by
   * default: with the status bar hidden that area is otherwise see-through and
   * the animated background showed around the camera, above the header.
   */
  topBarColor?: string;
}

/**
 * Screen wrapper that pads the top and sides so content never sits under a
 * camera cutout, notch or rounded corner, and fills that top area with a solid
 * strip. The bottom is left to the tab bar, which applies its own inset.
 */
export function ScreenView({ style, children, topBarColor = PIXEL.bg }: ScreenViewProps) {
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
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top, backgroundColor: topBarColor }}
        />
      ) : null}
      {children}
    </View>
  );
}
