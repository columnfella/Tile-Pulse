/**
 * Shared motion presets so every screen animates with the same feel.
 * Layout animations run on the UI thread via Reanimated.
 */
import {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeOutDown,
  Keyframe,
  LinearTransition,
} from 'react-native-reanimated';

export const SPRING = { damping: 18, stiffness: 260, mass: 0.6 };

/** Dimmed backdrop behind overlays. */
export const backdropIn = FadeIn.duration(180);
export const backdropOut = FadeOut.duration(160);

/** Cards / sheets rising into place. */
export const cardIn = FadeInDown.springify().damping(18).stiffness(220);
export const cardOut = FadeOutDown.duration(160);

/** Staggered list items. */
export const listItemIn = (index: number) =>
  FadeInDown.delay(Math.min(index, 8) * 55)
    .springify()
    .damping(18)
    .stiffness(200);
export const listItemOut = FadeOut.duration(150);
export const listLayout = LinearTransition.springify().damping(20).stiffness(220);

/** Quick "pop" used for judgments, combo bumps and countdown numbers. */
export const popIn = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 1.5 }] },
  60: { opacity: 1, transform: [{ scale: 0.95 }], easing: Easing.out(Easing.quad) },
  100: { opacity: 1, transform: [{ scale: 1 }] },
}).duration(220);

export const comboBump = new Keyframe({
  0: { transform: [{ scale: 1.25 }] },
  100: { transform: [{ scale: 1 }], easing: Easing.out(Easing.back(2)) },
}).duration(180);

export const countdownOut = new Keyframe({
  0: { opacity: 1, transform: [{ scale: 1 }] },
  100: { opacity: 0, transform: [{ scale: 0.6 }] },
}).duration(200);
