/**
 * Hardcore mode, switched on per level from its card (one miss = instant loss).
 * Kept in memory only while the app is open: nothing is written to storage,
 * and switching it off simply forgets the level.
 */
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const enabled = new Set<string>();
const listeners = new Set<() => void>();

// Older versions saved the choices; clear that once so it doesn't take up space
AsyncStorage.removeItem('tilepulse_hardcore_levels_v1').catch(() => {});

export function setHardcore(songId: string, on: boolean): void {
  if (on) enabled.add(songId);
  else enabled.delete(songId);
  listeners.forEach((l) => l());
}

/** [is hardcore on for this level, toggle] */
export function useHardcore(songId: string): [boolean, () => void] {
  const [on, setOn] = useState(() => enabled.has(songId));
  useEffect(() => {
    const sync = () => setOn(enabled.has(songId));
    listeners.add(sync);
    sync();
    return () => {
      listeners.delete(sync);
    };
  }, [songId]);
  return [on, () => setHardcore(songId, !enabled.has(songId))];
}
