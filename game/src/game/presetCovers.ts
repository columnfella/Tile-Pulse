/**
 * Cover pictures of the built-in sample levels, bundled with the app.
 * Both are free to use without credit (Wikimedia Commons):
 *  - fur-elise.jpg: "Clark Art Institute - piano a.JPG", an ornate grand piano (public domain)
 *  - ode-to-joy.jpg: "Monarch Upright Piano.jpg" (CC0)
 */
import type { ImageSourcePropType } from 'react-native';
import { FUR_ELISE, ODE_TO_JOY } from './presets';

export const PRESET_COVERS: Record<string, ImageSourcePropType> = {
  [FUR_ELISE.song.id]: require('../assets/covers/fur-elise.jpg'),
  [ODE_TO_JOY.song.id]: require('../assets/covers/ode-to-joy.jpg'),
};
