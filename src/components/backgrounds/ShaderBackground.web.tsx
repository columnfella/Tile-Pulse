/**
 * Web fallback for the Swirl shader. react-native-skia needs its WebAssembly
 * runtime loaded before use on web, so the browser preview shows a static
 * gradient in the palette's colours instead.
 */

import React, { memo } from 'react';
import { StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { SharedValue } from 'react-native-reanimated';

export interface SwirlPalette {
  c1: [number, number, number];
  c2: [number, number, number];
  c3: [number, number, number];
}

const toHex = ([r, g, b]: [number, number, number]) =>
  `#${[r, g, b].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`;

interface ShaderBackgroundProps {
  palette: SwirlPalette;
  width: number;
  height: number;
  opacity: number;
  bpm?: number;
  songTime?: SharedValue<number>;
  flash?: SharedValue<number>;
}

export const ShaderBackground = memo(function ShaderBackground({ palette, opacity }: ShaderBackgroundProps) {
  return (
    <LinearGradient
      colors={[toHex(palette.c1), toHex(palette.c3), toHex(palette.c2)]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[StyleSheet.absoluteFill, { opacity }]}
      pointerEvents="none"
    />
  );
});
