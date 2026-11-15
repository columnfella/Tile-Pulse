/**
 * "Swirl" background — an original GPU shader rendered with react-native-skia.
 *
 * Look: slowly turning, marbled paint in three colours. Technique:
 *  1. Spiral twist — each pixel is rotated around the centre by an angle that
 *     grows with its distance, so bands wind into a spiral that slowly turns.
 *  2. Domain warping — a few layers of sine offsets, each at a higher
 *     frequency and lower strength, push the coordinates around so the bands
 *     flow and fold like liquid paint.
 *  3. Banding — the warped field is mapped onto the palette with smooth
 *     transitions, plus soft highlights on the brightest ridges.
 * During gameplay the highlights swell on every beat of the song.
 */

import React, { memo } from 'react';
import { Canvas, Fill, Shader, Skia, useClock } from '@shopify/react-native-skia';
import Animated, { useAnimatedStyle, useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { StyleSheet } from 'react-native';

export interface SwirlPalette {
  /** Bright paint colour, RGB 0–1. */
  c1: [number, number, number];
  /** Mid paint colour. */
  c2: [number, number, number];
  /** Dark base colour. */
  c3: [number, number, number];
}

const SWIRL_SKSL = `
uniform float2 iResolution;
uniform float iTime;
uniform float uBeat;      // 0..1, spikes on each beat (0 when no song)
uniform float uFlash;     // 0..1, spikes when a tile is hit
uniform float3 uColour1;
uniform float3 uColour2;
uniform float3 uColour3;

const float TWIST = 2.6;        // how tightly the spiral winds
const float TURN_SPEED = 0.08;  // spiral rotation speed
const float FLOW_SPEED = 0.35;  // paint flow speed
const float SCALE = 2.4;        // size of the paint bands

float2 rotate(float2 p, float a) {
  float s = sin(a);
  float c = cos(a);
  return float2(c * p.x - s * p.y, s * p.x + c * p.y);
}

half4 main(float2 fragCoord) {
  // Centered coordinates, aspect-corrected (shorter side = 1)
  float2 uv = (fragCoord - 0.5 * iResolution) / min(iResolution.x, iResolution.y);

  // 1. Spiral twist that slowly turns over time
  float r = length(uv);
  uv = rotate(uv, TWIST * r - iTime * TURN_SPEED);

  // 2. Domain warping: layered sine offsets
  float t = iTime * FLOW_SPEED;
  float2 p = uv * SCALE;
  for (int i = 1; i <= 5; i++) {
    float k = float(i);
    p.x += 0.55 / k * sin(k * p.y + t + 0.9 * k);
    p.y += 0.55 / k * cos(k * p.x - 0.8 * t + 2.3 * k);
  }

  // 3. Map the warped field onto three colour bands
  float field = 0.5 + 0.5 * sin(p.x * 1.3 + p.y * 0.9 + 0.6 * sin(t * 0.5));
  float3 col = mix(uColour3, uColour2, smoothstep(0.15, 0.5, field));
  col = mix(col, uColour1, smoothstep(0.55, 0.9, field));

  // Soft highlights on the brightest ridges, stronger on the beat
  float ridge = pow(smoothstep(0.82, 1.0, field), 2.0);
  col += ridge * (0.22 + 0.3 * uBeat);

  // Hit flash: lift the whole image, brightest colours most
  col += uFlash * (0.12 + 0.55 * col);

  // Gentle vignette keeps the edges calm behind the UI
  col *= 1.0 - 0.35 * smoothstep(0.4, 1.1, r);

  return half4(half3(col), 1.0);
}
`;

/** Fraction of screen resolution the shader is drawn at (then scaled up). */
const RENDER_SCALE = 0.5;

const swirlEffect = Skia.RuntimeEffect.Make(SWIRL_SKSL);
if (!swirlEffect) console.warn('Swirl shader failed to compile');

interface ShaderBackgroundProps {
  palette: SwirlPalette;
  width: number;
  height: number;
  opacity: number;
  bpm?: number;
  /** Game clock; when provided the highlights swell on every beat. */
  songTime?: SharedValue<number>;
  /** Hit flash (0–1); brightens the swirl on every hit. */
  flash?: SharedValue<number>;
}

export const ShaderBackground = memo(function ShaderBackground({
  palette,
  width,
  height,
  opacity,
  bpm = 100,
  songTime,
  flash,
}: ShaderBackgroundProps) {
  const clock = useClock(); // milliseconds, advanced on the UI thread

  const uniforms = useDerivedValue(() => {
    let beat = 0;
    if (songTime && songTime.value > 0) {
      const phase = (songTime.value * bpm) / 60;
      const f = phase - Math.floor(phase);
      beat = (1 - f) * (1 - f) * (1 - f); // sharp attack, smooth decay
    }
    return {
      iResolution: [width * RENDER_SCALE, height * RENDER_SCALE],
      iTime: clock.value / 1000,
      uBeat: beat,
      uFlash: flash ? flash.value : 0,
      uColour1: palette.c1,
      uColour2: palette.c2,
      uColour3: palette.c3,
    };
  });

  const flashStyle = useAnimatedStyle(() => {
    const f = flash ? flash.value : 0;
    return { opacity: opacity + (1 - opacity) * 0.6 * f };
  });

  if (!swirlEffect) return null;

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, flashStyle]}>
      {/* Rendered at half resolution and scaled up: a quarter of the GPU work */}
      <Canvas
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: width * RENDER_SCALE,
          height: height * RENDER_SCALE,
          transformOrigin: 'top left',
          transform: [{ scale: 1 / RENDER_SCALE }],
        }}
        pointerEvents="none"
      >
        <Fill>
          <Shader source={swirlEffect} uniforms={uniforms} />
        </Fill>
      </Canvas>
    </Animated.View>
  );
});
