/**
 * One shared animated background behind every tab (the theme picked with the
 * palette button on the Songs tab, e.g. the blue swirl shader).
 *
 * - Lives in the tab layout, so switching tabs never restarts it.
 * - Fades out in the editor (it would distract from the grid) and while a
 *   level is open (the tabs aren't visible then, so it stops drawing to save
 *   battery / GPU), and fades back in afterwards.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useIsFocused, usePathname } from 'expo-router';
import { AnimatedBackground } from './AnimatedBackground';
import { useDefaultBackground } from '../../services/settings';

import { C } from '../../theme/palette';
/** Strength behind the tabs: visible, but text and cards stay easy to read. */
const OPACITY = 0.38;

export function TabsBackground() {
  const background = useDefaultBackground();
  const pathname = usePathname();
  const focused = useIsFocused(); // false while a level (pushed on top of the tabs) is open
  const inEditor = pathname.startsWith('/editor');
  const show = focused && !inEditor;

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.base]}>
      {show ? (
        <Animated.View entering={FadeIn.duration(450)} exiting={FadeOut.duration(250)} style={StyleSheet.absoluteFill}>
          <AnimatedBackground id={background} opacity={OPACITY} />
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { backgroundColor: C.bg },
});
