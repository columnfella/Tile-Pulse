/**
 * Slide tile (iOS / Android): only the "SLIDE" label on the head. The slide
 * itself is drawn by SlideLayer in one shared Skia canvas, which is much
 * cheaper than a canvas per tile. (Web draws the whole tile: SlideTileView.web.tsx.)
 */
import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import type { SlidePoint } from '../../types/song';
import { slideXAt } from '../../game/engine';
import { FONTS } from '../../theme/pixel';
import { SLIDE_HEAD_HEIGHT } from './SlideLayer';

import { C, themedStyles } from '../../theme/palette';
export interface LiveSlideProgress {
  songTime: SharedValue<number>;
  start: number;
  duration: number;
}

interface SlideTileViewProps {
  id?: string;
  path: SlidePoint[];
  laneWidth?: number;
  durationBeats: number;
  pixelsPerBeat: number;
  height: number;
  isHolding: boolean;
  holdProgress: number;
  isHit: boolean;
  isMissed: boolean;
  live?: LiveSlideProgress;
}

export const SlideTileView = memo(function SlideTileView({
  path,
  laneWidth = 0,
  pixelsPerBeat,
  height,
  isHolding,
}: SlideTileViewProps) {
  if (laneWidth <= 0 || path.length < 2) return null;
  // Centre of the head, which follows the slide's angle
  const headX = (slideXAt(path, SLIDE_HEAD_HEIGHT / 2 / pixelsPerBeat) + 0.5) * laneWidth;
  return (
    <View pointerEvents="none" style={[styles.root, { height }]}>
      <Text
        style={[
          styles.headText,
          { left: headX - 40, bottom: (SLIDE_HEAD_HEIGHT - 10) / 2 },
          isHolding && styles.headTextHolding,
        ]}
      >
        SLIDE
      </Text>
    </View>
  );
});

const styles = themedStyles(() => ({
  root: { position: 'absolute', top: 0, left: 0, right: 0 },
  headText: {
    position: 'absolute',
    width: 80,
    textAlign: 'center',
    fontFamily: FONTS.pixel,
    fontSize: 7,
    lineHeight: 10,
    color: C.onAccent,
  },
  headTextHolding: { color: C.textStrong },
}));
