/**
 * Synthesized animated backgrounds ("video-like" loops drawn by the app).
 *
 * Everything runs on the UI thread with Reanimated: one shared clock per
 * background is advanced by a frame callback, and each element derives its
 * position / opacity from it in a worklet. Only transforms and opacity are
 * animated, so these stay cheap even behind gameplay.
 *
 * The Pulse background can lock to the music: pass the game's `songTime`
 * shared value and the song's BPM and its rings spawn exactly on the beat.
 */

import React, { memo, useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { ShaderBackground, type SwirlPalette } from './ShaderBackground';

export type SwirlId = 'swirl_ember' | 'swirl_ocean' | 'swirl_sunset' | 'swirl_neon' | 'swirl_mint';
export type BackgroundId = 'none' | 'aurora' | 'pulse' | 'particles' | 'waves' | 'grid' | 'stars' | SwirlId;

/** Colour palettes for the Swirl shader (RGB 0–1). */
export const SWIRL_PALETTES: Record<SwirlId, SwirlPalette> = {
  swirl_ember: { c1: [1.0, 0.42, 0.29], c2: [0.18, 0.42, 1.0], c3: [0.02, 0.03, 0.06] }, // coral + blue
  swirl_ocean: { c1: [0.3, 0.55, 1.0], c2: [0.1, 0.24, 0.6], c3: [0.01, 0.02, 0.05] }, // deep blue
  swirl_sunset: { c1: [1.0, 0.42, 0.29], c2: [0.55, 0.2, 0.12], c3: [0.02, 0.02, 0.03] }, // coral
  swirl_neon: { c1: [0.45, 0.7, 1.0], c2: [1.0, 0.42, 0.29], c3: [0.02, 0.04, 0.1] }, // electric
  swirl_mint: { c1: [0.12, 0.25, 0.6], c2: [0.05, 0.1, 0.28], c3: [0.0, 0.01, 0.03] }, // midnight
};

const isSwirl = (id: BackgroundId): id is SwirlId => id.startsWith('swirl_');

export const BACKGROUNDS: { id: BackgroundId; name: string; description: string }[] = [
  { id: 'none', name: 'Plain', description: 'No animation' },
  { id: 'aurora', name: 'Aurora', description: 'Slow drifting color glows' },
  { id: 'pulse', name: 'Pulse', description: 'Rings that pulse on the beat' },
  { id: 'particles', name: 'Particles', description: 'Rising glowing particles' },
  { id: 'waves', name: 'Light Waves', description: 'Soft bands of light sweeping down' },
  { id: 'grid', name: 'Neon Grid', description: 'Retro synthwave grid' },
  { id: 'stars', name: 'Starfield', description: 'Twinkling stars' },
  { id: 'swirl_ember', name: 'Swirl · Coral Blue', description: 'Flowing paint swirl in coral and blue' },
  { id: 'swirl_ocean', name: 'Swirl · Deep Blue', description: 'Flowing paint swirl in deep blues' },
  { id: 'swirl_sunset', name: 'Swirl · Coral', description: 'Flowing paint swirl in coral on black' },
  { id: 'swirl_neon', name: 'Swirl · Electric', description: 'Bright blue swirl with coral accents' },
  { id: 'swirl_mint', name: 'Swirl · Midnight', description: 'Dark navy swirl' },
];

export const isBackgroundId = (v: unknown): v is BackgroundId =>
  typeof v === 'string' && BACKGROUNDS.some((b) => b.id === v);

const PALETTE = ['#2f6bff', '#4d8dff', '#FF6B4A', '#1a3d99'] as const;

/** Deterministic pseudo-random numbers so layouts are stable between renders. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

interface LayerProps {
  clock: SharedValue<number>;
  width: number;
  height: number;
}

/* ------------------------------- Aurora ------------------------------- */

const AuroraBlob = ({ clock, width, height, index }: LayerProps & { index: number }) => {
  const size = Math.max(width, height) * 0.9;
  const color = PALETTE[index % PALETTE.length];
  const period = 9 + index * 3.5;
  const style = useAnimatedStyle(() => {
    const t = (clock.value / period) * Math.PI * 2;
    return {
      opacity: 0.35 + 0.35 * Math.sin(t + index),
      transform: [
        { translateX: Math.sin(t + index * 2) * width * 0.35 + (index - 1) * width * 0.25 },
        { translateY: Math.cos(t * 0.8 + index) * height * 0.3 + (index - 1) * height * 0.15 },
        { scale: 1 + 0.15 * Math.sin(t * 1.3) },
      ],
    };
  });
  return (
    <Animated.View
      style={[
        styles.blob,
        { width: size, height: size, borderRadius: size / 2, left: (width - size) / 2, top: (height - size) / 2 },
        style,
      ]}
    >
      <LinearGradient
        colors={[`${color}aa`, `${color}00`]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={[StyleSheet.absoluteFill, { borderRadius: size / 2 }]}
      />
    </Animated.View>
  );
};

const Aurora = (p: LayerProps) => (
  <>
    {[0, 1, 2].map((i) => (
      <AuroraBlob key={i} {...p} index={i} />
    ))}
  </>
);

/* -------------------------------- Pulse -------------------------------- */

const RING_COUNT = 3;

const PulseRing = ({
  phase,
  width,
  height,
  index,
}: {
  phase: SharedValue<number>;
  width: number;
  height: number;
  index: number;
}) => {
  const size = Math.min(width, height) * 0.5;
  const color = PALETTE[index % PALETTE.length];
  const style = useAnimatedStyle(() => {
    // Each ring lives for RING_COUNT beats, born on its own beat
    const p = ((phase.value % 1) + index) / RING_COUNT;
    return {
      opacity: (1 - p) * 0.8,
      transform: [{ scale: 0.3 + p * 2.6 }],
    };
  });
  return (
    <Animated.View
      style={[
        styles.ring,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          left: (width - size) / 2,
          top: height * 0.42 - size / 2,
          borderColor: color,
        },
        style,
      ]}
    />
  );
};

const Pulse = ({
  clock,
  width,
  height,
  bpm,
  songTime,
}: LayerProps & { bpm: number; songTime?: SharedValue<number> }) => {
  // Beat phase: from the song clock when available, otherwise free-running
  const phase = useSharedValue(0);
  useFrameCallback(() => {
    const seconds = songTime ? songTime.value : clock.value;
    phase.value = (seconds * bpm) / 60;
  });
  const glow = useAnimatedStyle(() => ({ opacity: 0.25 + 0.35 * Math.pow(1 - (phase.value % 1), 3) }));
  const size = Math.min(width, height) * 0.9;
  return (
    <>
      <Animated.View
        style={[
          styles.blob,
          { width: size, height: size, borderRadius: size / 2, left: (width - size) / 2, top: height * 0.42 - size / 2 },
          glow,
        ]}
      >
        <LinearGradient colors={['#4d8dff55', '#4d8dff00']} style={[StyleSheet.absoluteFill, { borderRadius: size / 2 }]} />
      </Animated.View>
      {Array.from({ length: RING_COUNT }, (_, i) => (
        <PulseRing key={i} phase={phase} width={width} height={height} index={i} />
      ))}
    </>
  );
};

/* ------------------------------ Particles ------------------------------ */

const Particle = ({ clock, width, height, seed }: LayerProps & { seed: number }) => {
  const cfg = useMemo(() => {
    const r = seeded(seed);
    return {
      x: r() * width,
      size: 4 + r() * 8,
      period: 6 + r() * 7,
      offset: r(),
      sway: 10 + r() * 30,
      color: PALETTE[Math.floor(r() * PALETTE.length)],
    };
  }, [seed, width]);
  const style = useAnimatedStyle(() => {
    const p = ((clock.value / cfg.period + cfg.offset) % 1 + 1) % 1;
    return {
      opacity: Math.sin(p * Math.PI) * 0.9,
      transform: [
        { translateY: height + 20 - p * (height + 40) },
        { translateX: Math.sin(p * Math.PI * 4) * cfg.sway },
      ],
    };
  });
  return (
    <Animated.View
      style={[
        styles.dot,
        {
          left: cfg.x,
          width: cfg.size,
          height: cfg.size,
          borderRadius: cfg.size / 2,
          backgroundColor: cfg.color,
        },
        style,
      ]}
    />
  );
};

const Particles = (p: LayerProps) => (
  <>
    {Array.from({ length: 16 }, (_, i) => (
      <Particle key={i} {...p} seed={i * 37 + 11} />
    ))}
  </>
);

/* -------------------------------- Waves -------------------------------- */

const WaveBand = ({ clock, width, height, index }: LayerProps & { index: number }) => {
  const bandH = height * 0.35;
  const color = PALETTE[index % PALETTE.length];
  const period = 7 + index * 2.5;
  const style = useAnimatedStyle(() => {
    const p = ((clock.value / period + index * 0.33) % 1 + 1) % 1;
    return {
      opacity: Math.sin(p * Math.PI) * 0.8,
      transform: [{ translateY: -bandH + p * (height + bandH) }],
    };
  });
  return (
    <Animated.View style={[styles.band, { width, height: bandH }, style]}>
      <LinearGradient colors={[`${color}00`, `${color}66`, `${color}00`]} style={StyleSheet.absoluteFill} />
    </Animated.View>
  );
};

const Waves = (p: LayerProps) => (
  <>
    {[0, 1, 2].map((i) => (
      <WaveBand key={i} {...p} index={i} />
    ))}
  </>
);

/* --------------------------------- Grid -------------------------------- */

const GRID_LINES = 12;

const GridLine = ({ clock, width, height, index }: LayerProps & { index: number }) => {
  const horizon = height * 0.38;
  const style = useAnimatedStyle(() => {
    // Lines start at the horizon and accelerate toward the viewer (perspective)
    const p = ((index + (clock.value * 0.6) % 1) / GRID_LINES) % 1;
    const y = horizon + p * p * (height - horizon);
    return { opacity: p * 0.9, transform: [{ translateY: y }] };
  });
  return <Animated.View style={[styles.gridLine, { width }, style]} />;
};

const Grid = (p: LayerProps) => {
  const { width, height } = p;
  const horizon = height * 0.38;
  const verticals = 9;
  return (
    <>
      <LinearGradient
        colors={['#FF6B4A00', '#FF6B4A44', '#4d8dff00']}
        locations={[0, 0.38, 0.6]}
        style={StyleSheet.absoluteFill}
      />
      {/* Vertical lines fanning out from the horizon */}
      {Array.from({ length: verticals }, (_, i) => {
        const spread = (i - (verticals - 1) / 2) / ((verticals - 1) / 2);
        const angle = Math.atan2(spread * width * 0.9, height - horizon);
        const length = (height - horizon) / Math.cos(angle);
        return (
          <View
            key={i}
            style={[
              styles.vLine,
              {
                height: length,
                left: width / 2,
                top: horizon,
                transformOrigin: 'top',
                transform: [{ rotate: `${-angle}rad` }],
              },
            ]}
          />
        );
      })}
      {Array.from({ length: GRID_LINES }, (_, i) => (
        <GridLine key={i} {...p} index={i} />
      ))}
    </>
  );
};

/* -------------------------------- Stars -------------------------------- */

const Star = ({ clock, width, height, seed }: LayerProps & { seed: number }) => {
  const cfg = useMemo(() => {
    const r = seeded(seed);
    return {
      x: r() * width,
      y: r() * height,
      size: 1.5 + r() * 3,
      period: 2 + r() * 4,
      offset: r() * 10,
      color: r() > 0.7 ? PALETTE[Math.floor(r() * PALETTE.length)] : '#ffffff',
    };
  }, [seed, width, height]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.15 + 0.85 * Math.pow(Math.max(0, Math.sin((clock.value + cfg.offset) / cfg.period * Math.PI * 2)), 2),
  }));
  return (
    <Animated.View
      style={[
        styles.dot,
        {
          left: cfg.x,
          top: cfg.y,
          width: cfg.size,
          height: cfg.size,
          borderRadius: cfg.size,
          backgroundColor: cfg.color,
        },
        style,
      ]}
    />
  );
};

const Stars = (p: LayerProps) => (
  <>
    {Array.from({ length: 28 }, (_, i) => (
      <Star key={i} {...p} seed={i * 53 + 7} />
    ))}
  </>
);

/* ------------------------------ Component ------------------------------ */

interface AnimatedBackgroundProps {
  id: BackgroundId;
  /** Overall strength (0–1). Kept low so tiles and text stay readable. */
  opacity?: number;
  /** Song tempo, used by the Pulse background. */
  bpm?: number;
  /** Game clock (seconds); locks Pulse to the music when provided. */
  songTime?: SharedValue<number>;
  /** Hit flash (0–1, spikes on every hit): the background brightens with it. */
  flash?: SharedValue<number>;
  /** Size override (e.g. small previews); defaults to the window. */
  width?: number;
  height?: number;
}

export const AnimatedBackground = memo(function AnimatedBackground({
  id,
  opacity = 0.45,
  bpm = 100,
  songTime,
  flash,
  width: w,
  height: h,
}: AnimatedBackgroundProps) {
  const window = useWindowDimensions();
  const width = w ?? window.width;
  const height = h ?? window.height;

  // Free-running clock in seconds, advanced on the UI thread
  const clock = useSharedValue(0);
  useFrameCallback((frame) => {
    clock.value += (frame.timeSincePreviousFrame ?? 16) / 1000;
  });

  // On a hit the layer jumps toward full strength, then settles back
  const flashStyle = useAnimatedStyle(() => {
    const f = flash ? flash.value : 0;
    return { opacity: opacity + (1 - opacity) * 0.85 * f };
  });
  const plainFlashStyle = useAnimatedStyle(() => ({ opacity: (flash ? flash.value : 0) * 0.22 }));

  if (id === 'none') {
    // Plain background: a soft blue wash on hits
    return flash ? (
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.plainFlash, plainFlashStyle]} />
    ) : null;
  }

  if (isSwirl(id)) {
    return (
      <ShaderBackground
        palette={SWIRL_PALETTES[id]}
        width={width}
        height={height}
        opacity={opacity}
        bpm={bpm}
        songTime={songTime}
        flash={flash}
      />
    );
  }

  const layer = { clock, width, height };
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.root, flashStyle]}>
      {id === 'aurora' && <Aurora {...layer} />}
      {id === 'pulse' && <Pulse {...layer} bpm={bpm} songTime={songTime} />}
      {id === 'particles' && <Particles {...layer} />}
      {id === 'waves' && <Waves {...layer} />}
      {id === 'grid' && <Grid {...layer} />}
      {id === 'stars' && <Stars {...layer} />}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  root: { overflow: 'hidden' },
  plainFlash: { backgroundColor: '#2f6bff' },
  blob: { position: 'absolute', overflow: 'hidden' },
  ring: { position: 'absolute', borderWidth: 2 },
  dot: {
    position: 'absolute',
    top: 0,
  },
  band: { position: 'absolute', left: 0, top: 0 },
  gridLine: { position: 'absolute', left: 0, top: 0, height: 1.5, backgroundColor: '#FF6B4A' },
  vLine: { position: 'absolute', width: 1, marginLeft: -0.5, backgroundColor: '#4d8dff55' },
});
