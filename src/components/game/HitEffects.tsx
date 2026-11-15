/**
 * Background flash on hits.
 *
 * `useHitFlash` owns a shared value that spikes on every hit and decays. The
 * game passes it to the animated background, which brightens in response
 * (the Swirl shader lights up its colours; other backgrounds raise their
 * opacity). It runs entirely on the UI thread — no React state per hit.
 */

import { useCallback } from 'react';
import { Easing, useSharedValue, withSequence, withTiming, type SharedValue } from 'react-native-reanimated';
import type { HitJudgment } from '../../types/game';

const PEAK: Record<HitJudgment, number> = {
  PERFECT: 1,
  GREAT: 0.75,
  GOOD: 0.5,
  MISS: 0, // no flash on a miss
};

export function useHitFlash(): {
  flash: SharedValue<number>;
  /** Flash for a judgment, or a custom strength 0–1 (e.g. a small pulse while holding). */
  triggerFlash: (judgment: HitJudgment | number) => void;
} {
  const flash = useSharedValue(0);
  const triggerFlash = useCallback(
    (judgment: HitJudgment | number) => {
      const peak = typeof judgment === 'number' ? judgment : PEAK[judgment];
      if (peak <= 0) return;
      flash.value = withSequence(
        withTiming(peak, { duration: 45 }),
        withTiming(0, { duration: 380, easing: Easing.out(Easing.quad) })
      );
    },
    [flash]
  );
  return { flash, triggerFlash };
}
