/**
 * Hardcore mode, switched on per level from its card (one miss = instant loss).
 * The choice is remembered on the device.
 */
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'tilepulse_hardcore_levels_v1';

let enabled = new Set<string>();
let loaded: Promise<void> | null = null;
const listeners = new Set<() => void>();

function load(): Promise<void> {
  if (!loaded) {
    loaded = AsyncStorage.getItem(KEY)
      .then((raw) => {
        const ids = raw ? JSON.parse(raw) : [];
        if (Array.isArray(ids)) enabled = new Set(ids.filter((x) => typeof x === 'string'));
      })
      .catch(() => {});
  }
  return loaded;
}

export function setHardcore(songId: string, on: boolean): void {
  const next = new Set(enabled);
  if (on) next.add(songId);
  else next.delete(songId);
  enabled = next;
  listeners.forEach((l) => l());
  AsyncStorage.setItem(KEY, JSON.stringify([...next])).catch(() => {});
}

/** [is hardcore on for this level, toggle] */
export function useHardcore(songId: string): [boolean, () => void] {
  const [on, setOn] = useState(() => enabled.has(songId));
  useEffect(() => {
    const sync = () => setOn(enabled.has(songId));
    listeners.add(sync);
    load().then(sync);
    return () => {
      listeners.delete(sync);
    };
  }, [songId]);
  return [on, () => setHardcore(songId, !enabled.has(songId))];
}
