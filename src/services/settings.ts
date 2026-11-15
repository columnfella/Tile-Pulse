import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isBackgroundId, type BackgroundId } from '../components/backgrounds/AnimatedBackground';

const DEFAULT_BG_KEY = 'tilepulse_default_background_v1';
const FALLBACK_BACKGROUND: BackgroundId = 'aurora';

let current: BackgroundId = FALLBACK_BACKGROUND;
let loaded: Promise<void> | null = null;
const listeners = new Set<(bg: BackgroundId) => void>();

function load(): Promise<void> {
  if (!loaded) {
    loaded = AsyncStorage.getItem(DEFAULT_BG_KEY)
      .then((v) => {
        if (isBackgroundId(v)) current = v;
      })
      .catch(() => {});
  }
  return loaded;
}

/** The app-wide theme background, used by songs set to "Default". */
export async function getDefaultBackground(): Promise<BackgroundId> {
  await load();
  return current;
}

export async function setDefaultBackground(bg: BackgroundId): Promise<void> {
  current = bg;
  listeners.forEach((l) => l(bg));
  await AsyncStorage.setItem(DEFAULT_BG_KEY, bg).catch((err) =>
    console.warn('Failed to save default background:', err)
  );
}

/** React hook: the current default background, updating live when changed. */
export function useDefaultBackground(): BackgroundId {
  const [bg, setBg] = useState<BackgroundId>(current);
  useEffect(() => {
    let mounted = true;
    load().then(() => mounted && setBg(current));
    listeners.add(setBg);
    return () => {
      mounted = false;
      listeners.delete(setBg);
    };
  }, []);
  return bg;
}
