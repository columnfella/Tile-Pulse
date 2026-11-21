import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { countdownOut, popIn } from '../ui/motion';
import { PixelIcon } from '../ui/PixelIcon';
import { FONTS } from '../../theme/pixel';

import { C, themedStyles, alpha } from '../../theme/palette';
interface LoadingOverlayProps {
  title?: string;
  subtitle?: string;
}

/** Full-screen loading card shown while the song's audio is prepared. */
export function LoadingOverlay({ title, subtitle }: LoadingOverlayProps) {
  const pulse = useSharedValue(0);
  const sweep = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 700, easing: Easing.inOut(Easing.quad) })
      ),
      -1
    );
    sweep.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.cubic) }), -1);
  }, [pulse, sweep]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * 0.08 }],
    shadowOpacity: 0.4 + pulse.value * 0.5,
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: 0.5 * (1 - pulse.value),
    transform: [{ scale: 1 + pulse.value * 0.5 }],
  }));
  const barStyle = useAnimatedStyle(() => ({
    left: `${-40 + sweep.value * 140}%`,
  }));

  return (
    <Animated.View
      entering={FadeIn.duration(150)}
      exiting={FadeOut.duration(350)}
      style={styles.overlay}
      pointerEvents="auto"
    >
      <View style={styles.iconWrap}>
        <Animated.View style={[styles.ring, ringStyle]} />
        <Animated.View style={[styles.icon, iconStyle]}>
          <PixelIcon name="note" size={28} color={C.textStrong} />
        </Animated.View>
      </View>

      {title ? (
        <Animated.Text entering={FadeIn.delay(80)} style={styles.title} numberOfLines={1}>
          {title}
        </Animated.Text>
      ) : null}
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

      <View style={styles.track}>
        <Animated.View style={[styles.bar, barStyle]} />
      </View>
      <Text style={styles.loadingText}>Loading track…</Text>
    </Animated.View>
  );
}

interface CountdownProps {
  /** Called once "GO" has been shown. */
  onDone: () => void;
  from?: number;
}

/** 3 · 2 · 1 · GO countdown drawn over the board before the music starts. */
export function Countdown({ onDone, from = 3 }: CountdownProps) {
  const [value, setValue] = useState(from);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (value < 0) {
      onDoneRef.current();
      return;
    }
    const t = setTimeout(() => setValue((v) => v - 1), value === 0 ? 380 : 600);
    return () => clearTimeout(t);
  }, [value]);

  if (value < 0) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(150)}
      exiting={FadeOut.duration(200)}
      style={styles.countdownLayer}
      pointerEvents="none"
    >
      <Animated.Text
        key={value}
        entering={popIn}
        exiting={countdownOut}
        style={[styles.countdownText, value === 0 && styles.goText]}
      >
        {value === 0 ? 'GO!' : value}
      </Animated.Text>
    </Animated.View>
  );
}

const styles = themedStyles(() => ({
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 200,
    elevation: 200,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  iconWrap: {
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  ring: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 0,
    borderWidth: 2,
    borderColor: C.blue,
  },
  icon: {
    width: 72,
    height: 72,
    borderRadius: 0,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.blue,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  title: {
    color: C.textStrong,
    fontFamily: FONTS.pixel,
    fontSize: 14,
    letterSpacing: 0,
    maxWidth: '90%',
  },
  subtitle: {
    color: C.textDim,
    fontFamily: FONTS.body,
    fontSize: 17,
    marginTop: 4,
  },
  track: {
    width: 160,
    height: 4,
    borderRadius: 0,
    backgroundColor: C.panelLight,
    overflow: 'hidden',
    marginTop: 28,
  },
  bar: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '40%',
    borderRadius: 0,
    backgroundColor: C.blue,
  },
  loadingText: {
    color: C.textSubtle,
    fontFamily: FONTS.body,
    fontSize: 16,
    letterSpacing: 1,
    marginTop: 10,
  },
  countdownLayer: {
    ...StyleSheet.absoluteFill,
    zIndex: 150,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: alpha(C.black, 0.35),
  },
  countdownText: {
    color: C.textStrong,
    fontFamily: FONTS.pixel,
    fontSize: 67,
    textShadowColor: C.blue,
    textShadowRadius: 30,
    textShadowOffset: { width: 0, height: 0 },
  },
  goText: {
    color: C.blue,
    fontFamily: FONTS.pixel,
    fontSize: 50,
  },
}));
