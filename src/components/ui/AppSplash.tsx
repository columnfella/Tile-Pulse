import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

const BAR_COLORS = ['#0ea5e9', '#38bdf8', '#7dd3fc', '#0284c7'];

/** One lane bar bouncing like an equalizer, offset by `index`. */
function LaneBar({ index }: { index: number }) {
  const level = useSharedValue(0.3);

  useEffect(() => {
    level.value = withDelay(
      index * 120,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 380, easing: Easing.out(Easing.quad) }),
          withTiming(0.3, { duration: 420, easing: Easing.in(Easing.quad) })
        ),
        -1
      )
    );
  }, [index, level]);

  const style = useAnimatedStyle(() => ({ transform: [{ scaleY: level.value }] }));

  return <Animated.View style={[styles.bar, { backgroundColor: BAR_COLORS[index] }, style]} />;
}

interface AppSplashProps {
  /** Called once the splash has laid out, so the native splash can hide without a flash. */
  onReady?: () => void;
}

/** Animated startup screen shown while the app initializes. */
export function AppSplash({ onReady }: AppSplashProps) {
  return (
    <Animated.View exiting={FadeOut.duration(450)} style={styles.root} onLayout={onReady}>
      <View style={styles.bars}>
        {[0, 1, 2, 3].map((i) => (
          <LaneBar key={i} index={i} />
        ))}
      </View>
      <Animated.Text entering={FadeInDown.delay(150).duration(500)} style={styles.title}>
        TilePulse
      </Animated.Text>
      <Animated.View entering={FadeIn.delay(400).duration(500)}>
        <Text style={styles.subtitle}>4-LANE RHYTHM STUDIO</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    zIndex: 1000,
    elevation: 1000,
    backgroundColor: '#030712',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 64,
    marginBottom: 22,
  },
  bar: {
    width: 14,
    height: 64,
    borderRadius: 7,
  },
  title: {
    color: '#ffffff',
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -1,
  },
  subtitle: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 3,
    marginTop: 6,
  },
});
