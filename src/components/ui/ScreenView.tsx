import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useScreenInsets } from './useScreenInsets';

interface ScreenViewProps {
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

/**
 * Screen wrapper that pads the top and sides so content never sits under a
 * camera cutout, notch or rounded corner. The bottom is left to the tab bar,
 * which applies its own inset.
 */
export function ScreenView({ style, children }: ScreenViewProps) {
  const insets = useScreenInsets();
  return (
    <View
      style={[
        { flex: 1, paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right },
        style,
      ]}
    >
      {children}
    </View>
  );
}
