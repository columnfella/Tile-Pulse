/**
 * Upload rule: a level can only be uploaded (or updated) after its creator
 * finished it in Hardcore mode (one miss = loss), so every posted level is
 * proven beatable.
 *
 * A clear is tied to the exact chart: the notes and the BPM. Editing a note
 * afterwards means clearing it again; changing only the name, description,
 * cover or background doesn't. Remembered on this device.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Song } from '../types/song';

const KEY = 'tilepulse_hardcore_clears_v1';

/** Short fingerprint of the chart (FNV-1a over the notes and BPM). */
export function chartKey(song: Pick<Song, 'bpm' | 'tiles'>): string {
  const notes = [...song.tiles]
    .map((t) => `${t.lane}:${t.beat}:${t.durationBeats}:${t.path ? JSON.stringify(t.path) : ''}`)
    .sort()
    .join('|');
  const text = `${song.bpm}#${notes}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${song.tiles.length}-${h.toString(16)}`;
}

async function readClears(): Promise<Record<string, string>> {
  try {
    return JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}') ?? {};
  } catch {
    return {};
  }
}

/** Called when a Hardcore run of a song is finished without a miss. */
export async function recordHardcoreClear(song: Song): Promise<void> {
  const all = await readClears();
  all[song.id] = chartKey(song);
  await AsyncStorage.setItem(KEY, JSON.stringify(all)).catch(() => {});
}

/** The chart fingerprint of the last Hardcore clear of a song (null if never cleared). */
export async function getHardcoreClearKey(songId: string): Promise<string | null> {
  return (await readClears())[songId] ?? null;
}

/** Has this exact chart been cleared in Hardcore? */
export async function hasHardcoreClear(song: Song): Promise<boolean> {
  return (await readClears())[song.id] === chartKey(song);
}
