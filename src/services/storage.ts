import { Song } from '../types/song';
import { STARTER_SONG } from '../game/starterSong';

const SONGS_STORAGE_KEY = 'tilepulse_songs_v1';
const DB_NAME = 'tilepulse_audio_db';
const DB_VERSION = 1;
const AUDIO_STORE_NAME = 'audio_files';

class StorageService {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private blobUrlMap = new Map<string, string>();

  private getDB(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(AUDIO_STORE_NAME)) {
            db.createObjectStore(AUDIO_STORE_NAME);
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return this.dbPromise;
  }

  /**
   * Initializes storage and ensures starter song is loaded on first launch
   */
  public async initStorage(): Promise<void> {
    try {
      await this.getDB();
      const songs = await this.getSongs();
      if (songs.length === 0) {
        // Seed starter sample song
        await this.saveSong(STARTER_SONG);
      }
    } catch (err) {
      console.warn('Storage initialization fallback:', err);
      // Fallback for private mode or limited environments
      const raw = localStorage.getItem(SONGS_STORAGE_KEY);
      if (!raw) {
        localStorage.setItem(SONGS_STORAGE_KEY, JSON.stringify([STARTER_SONG]));
      }
    }
  }

  public async getSongs(): Promise<Song[]> {
    try {
      const raw = localStorage.getItem(SONGS_STORAGE_KEY);
      if (!raw) return [];
      const songs: Song[] = JSON.parse(raw);
      return songs;
    } catch {
      return [STARTER_SONG];
    }
  }

  public async getSongById(id: string): Promise<Song | null> {
    const songs = await this.getSongs();
    return songs.find((s) => s.id === id) || null;
  }

  public async saveSong(song: Song): Promise<void> {
    const songs = await this.getSongs();
    const existingIndex = songs.findIndex((s) => s.id === song.id);
    if (existingIndex >= 0) {
      songs[existingIndex] = song;
    } else {
      songs.unshift(song);
    }
    localStorage.setItem(SONGS_STORAGE_KEY, JSON.stringify(songs));
  }

  public async deleteSong(id: string): Promise<void> {
    const songs = await this.getSongs();
    const filtered = songs.filter((s) => s.id !== id);
    localStorage.setItem(SONGS_STORAGE_KEY, JSON.stringify(filtered));

    // Also delete audio blob from IndexedDB if stored
    try {
      const db = await this.getDB();
      const tx = db.transaction(AUDIO_STORE_NAME, 'readwrite');
      tx.objectStore(AUDIO_STORE_NAME).delete(id);
    } catch {
      // Ignore
    }

    if (this.blobUrlMap.has(id)) {
      URL.revokeObjectURL(this.blobUrlMap.get(id)!);
      this.blobUrlMap.delete(id);
    }
  }

  /**
   * Stores an audio file blob into IndexedDB and returns a playable Object URL
   */
  public async saveAudioBlob(songId: string, blob: Blob): Promise<string> {
    const db = await this.getDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(AUDIO_STORE_NAME, 'readwrite');
      const req = tx.objectStore(AUDIO_STORE_NAME).put(blob, songId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });

    const objectUrl = URL.createObjectURL(blob);
    this.blobUrlMap.set(songId, objectUrl);
    return objectUrl;
  }

  /**
   * Retrieves an audio blob and returns or creates its Object URL
   */
  public async getAudioUriForSong(song: Song): Promise<string> {
    if (song.audioUri.startsWith('synthesized:')) {
      return song.audioUri;
    }

    if (this.blobUrlMap.has(song.id)) {
      return this.blobUrlMap.get(song.id)!;
    }

    try {
      const db = await this.getDB();
      const blob = await new Promise<Blob | null>((resolve, reject) => {
        const tx = db.transaction(AUDIO_STORE_NAME, 'readonly');
        const req = tx.objectStore(AUDIO_STORE_NAME).get(song.id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });

      if (blob) {
        const url = URL.createObjectURL(blob);
        this.blobUrlMap.set(song.id, url);
        return url;
      }
    } catch (err) {
      console.warn('Failed to retrieve audio blob from IndexedDB:', err);
    }

    return song.audioUri;
  }
}

export const storageService = new StorageService();
