import AsyncStorage from '@react-native-async-storage/async-storage';
import { Song } from '../types/song';
import { STARTER_SONG } from '../game/starterSong';
import { PRESET_SONGS } from '../game/presets';
import type { PickedAudioResult } from './documentPicker';
import {
  saveImportedAudio,
  resolveAudioUri,
  deleteAudio,
} from './audioFileStore';

const SONGS_STORAGE_KEY = 'tilepulse_songs_v1';
const SEEDED_PRESETS_KEY = 'tilepulse_seeded_presets_v1';

/**
 * Persists song metadata/beatmaps in AsyncStorage (works on iOS, Android and
 * web) and delegates audio file storage to the platform-specific
 * audioFileStore (file system on native, IndexedDB on web).
 */
class StorageService {
  private cache: Song[] | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * Seeds the starter song on first launch. Safe to call repeatedly and never
   * rejects, so callers don't need to guard it.
   */
  public initStorage(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = (async () => {
        try {
          const raw = await AsyncStorage.getItem(SONGS_STORAGE_KEY);
          const songs: Song[] = raw ? JSON.parse(raw) : [];

          // Which presets were already offered to this player. Older installs
          // predate this key and only ever received Für Elise.
          const seededRaw = await AsyncStorage.getItem(SEEDED_PRESETS_KEY);
          const seeded: string[] = seededRaw
            ? JSON.parse(seededRaw)
            : raw !== null
              ? [STARTER_SONG.id]
              : [];

          // Add presets this player hasn't been given yet (a preset they
          // deleted stays deleted, because it's already in `seeded`).
          const missing = PRESET_SONGS.map((p) => p.song).filter(
            (p) => !seeded.includes(p.id) && !songs.some((s) => s.id === p.id)
          );
          if (raw === null || missing.length > 0) {
            await this.writeSongs([...songs, ...missing]);
          }
          await AsyncStorage.setItem(
            SEEDED_PRESETS_KEY,
            JSON.stringify([...new Set([...seeded, ...PRESET_SONGS.map((p) => p.song.id)])])
          );
        } catch (err) {
          console.warn('Storage initialization failed:', err);
          this.cache = PRESET_SONGS.map((p) => p.song);
        }
      })();
    }
    return this.initPromise;
  }

  public async getSongs(): Promise<Song[]> {
    await this.initStorage();
    if (this.cache) return [...this.cache];
    try {
      const raw = await AsyncStorage.getItem(SONGS_STORAGE_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      this.cache = Array.isArray(parsed) ? (parsed as Song[]) : [];
    } catch (err) {
      console.warn('Failed to read songs, falling back to starter song:', err);
      this.cache = PRESET_SONGS.map((p) => p.song);
    }
    return [...this.cache];
  }

  public async getSongById(id: string): Promise<Song | null> {
    const songs = await this.getSongs();
    return songs.find((s) => s.id === id) ?? null;
  }

  public async saveSong(song: Song): Promise<void> {
    const songs = await this.getSongs();
    const existingIndex = songs.findIndex((s) => s.id === song.id);
    if (existingIndex >= 0) {
      songs[existingIndex] = song;
    } else {
      songs.unshift(song);
    }
    await this.writeSongs(songs);
  }

  public async deleteSong(id: string): Promise<void> {
    const songs = await this.getSongs();
    const target = songs.find((s) => s.id === id);
    await this.writeSongs(songs.filter((s) => s.id !== id));
    if (target) await deleteAudio(id, target.audioUri);
  }

  /** Copies a picked audio file into persistent storage; returns the URI to store on the Song. */
  public importAudio(songId: string, picked: PickedAudioResult): Promise<string> {
    return saveImportedAudio(songId, picked);
  }

  /**
   * Imports a device audio file as a new song with default settings
   * (120 BPM, 4/4, empty beatmap — editable later in the Editor).
   */
  public async importDeviceSong(file: {
    name: string;
    uri: string;
    durationSeconds?: number;
  }): Promise<Song> {
    const id = `song_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const audioUri = await saveImportedAudio(id, { canceled: false, name: file.name, uri: file.uri });
    const song: Song = {
      id,
      title: file.name.replace(/\.[^/.]+$/, '') || 'Untitled',
      audioUri,
      bpm: 120,
      timeSignature: { beatsPerMeasure: 4, beatUnit: 4 },
      tiles: [],
      createdAt: Date.now(),
      durationSeconds: file.durationSeconds && file.durationSeconds > 0 ? file.durationSeconds : undefined,
      sourceUri: file.uri,
    };
    await this.saveSong(song);
    return song;
  }

  /** Returns a URI the audio player can load for this song. */
  public async getAudioUriForSong(song: Song): Promise<string> {
    if (song.audioUri.startsWith('synthesized:')) return song.audioUri;
    return resolveAudioUri(song.id, song.audioUri);
  }

  private async writeSongs(songs: Song[]): Promise<void> {
    this.cache = songs;
    await AsyncStorage.setItem(SONGS_STORAGE_KEY, JSON.stringify(songs));
  }
}

export const storageService = new StorageService();
