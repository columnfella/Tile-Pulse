import React from 'react';
import { Text, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { comboBump } from '../ui/motion';

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
    fontSize: 42,
    fontWeight: '900',
    color: '#ffffff',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  comboLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 3,
    color: '#38bdf8',
  },
});
