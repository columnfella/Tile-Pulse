import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { SlideEdge, SlideStrip } from '../../game/engine';

const LANE = 25; // % of the board per lane

export interface SlideColors {
  body: string;
  /** Top / left bevel. */
  light: string;
  /** Bottom / right bevel. */
  dark: string;
  /** Centre line showing which way the slide goes. */
  rail: string;
}

export const SLIDE_COLORS = {
  normal: { body: '#123a9e', light: '#7aa4ff', dark: '#0a1f5c', rail: '#4d8dff' },
  filled: { body: '#2f6bff', light: '#b3caff', dark: '#163fa8', rail: '#FF6B4A' },
  missed: { body: '#7d1411', light: '#ff7a73', dark: '#4a0b09', rail: '#d8342f' },
  selected: { body: '#1d4fd1', light: '#ffffff', dark: '#ffffff', rail: '#FF6B4A' },
} satisfies Record<string, SlideColors>;

interface SlideBodyProps {
  strips: SlideStrip[];
  edges: SlideEdge[];
  colors: SlideColors;
  /** Bevel thickness in px. */
  bevel: number;
  /** Width of the centre rail in px. */
  rail?: number;
}

const leftPct = (lanes: number) => `${lanes * LANE}%` as const;
const rightPct = (lanes: number) => `${(4 - lanes) * LANE}%` as const;

/**
 * Draws a slide from its bands: a solid body, a bevel that runs continuously
 * around every step (light top/left, dark bottom/right, like the tap tiles),
 * and a rail down the middle that follows the path.
 */
export const SlideBody = memo(function SlideBody({ strips, edges, colors, bevel, rail = 4 }: SlideBodyProps) {
  return (
    <>
      {strips.map((s, i) => (
        <View
          key={`s${i}`}
          style={[
            styles.abs,
            {
              top: s.top,
              height: s.height,
              left: leftPct(s.left),
              right: rightPct(s.right),
              backgroundColor: colors.body,
              borderLeftWidth: bevel,
              borderRightWidth: bevel,
              borderLeftColor: colors.light,
              borderRightColor: colors.dark,
            },
          ]}
        />
      ))}
      {strips.map((s, i) => (
        <View
          key={`r${i}`}
          style={[
            styles.abs,
            {
              top: s.top,
              height: s.height,
              left: leftPct(s.railFrom),
              right: rightPct(s.railTo),
              marginLeft: -rail / 2,
              marginRight: -rail / 2,
              backgroundColor: colors.rail,
              opacity: 0.55,
            },
          ]}
        />
      ))}
      {edges.map((e, i) => (
        <View
          key={`e${i}`}
          style={[
            styles.abs,
            {
              top: e.side === 'top' ? e.y : e.y - bevel,
              height: bevel,
              left: leftPct(e.from),
              right: rightPct(e.to),
              backgroundColor: e.side === 'top' ? colors.light : colors.dark,
            },
          ]}
        />
      ))}
    </>
  );
});

const styles = StyleSheet.create({
  abs: { position: 'absolute' },
});
