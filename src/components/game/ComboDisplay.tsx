import React from 'react';
import { Text, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { comboBump } from '../ui/motion';
import { FONTS } from '../../theme/pixel';

interface ComboDisplayProps {
  combo: number;
}

export const ComboDisplay: React.FC<ComboDisplayProps> = ({ combo }) => {
  if (combo <= 1) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(150)}
      exiting={FadeOut.duration(300)}
      pointerEvents="none"
      style={styles.container}
    >
      <Animated.View key={combo} entering={comboBump} style={styles.inner}>
        <Text style={styles.comboNumber}>{combo}</Text>
        <Text style={styles.comboLabel}>COMBO</Text>
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: '42%',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    opacity: 0.9,
  },
  inner: {
    alignItems: 'center',
  },
  comboNumber: {
    fontFamily: FONTS.pixel,
    fontSize: 29,
    color: '#ffffff',
    textShadowColor: '#FF6B4A',
    textShadowOffset: { width: 3, height: 3 },
    textShadowRadius: 0.1,
  },
  comboLabel: {
    fontFamily: FONTS.body,
    fontSize: 15,
    letterSpacing: 3,
    color: '#4d8dff',
  },
});
