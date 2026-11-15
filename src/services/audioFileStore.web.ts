/**
 * Web audio file persistence using IndexedDB (browser preview only).
 * Same exports as the native audioFileStore.ts.
 */

import type { PickedAudioResult } from './documentPicker';

const DB_NAME = 'tilepulse_audio_db';
const STORE = 'audio_files';
const IDB_PREFIX = 'idb:';

let dbPromise: Promise<IDBDatabase> | null = null;
const blobUrls = new Map<string, string>();

function getDB(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    // Allow a retry later if opening failed
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

function request<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  return getDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const req = op(db.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
      })
  );
}

export async function saveImportedAudio(songId: string, picked: PickedAudioResult): Promise<string> {
  let blob = picked.file;
  if (!blob && picked.uri) blob = await (await fetch(picked.uri)).blob();
  if (!blob) throw new Error('No audio file selected');
  await request('readwrite', (s) => s.put(blob, songId));
  blobUrls.set(songId, URL.createObjectURL(blob));
  return `${IDB_PREFIX}${songId}`;
}

export async function resolveAudioUri(songId: string, storedUri: string): Promise<string> {
  if (!storedUri.startsWith(IDB_PREFIX)) return storedUri;
  const cached = blobUrls.get(songId);
  if (cached) return cached;
  const blob = await request<Blob | undefined>('readonly', (s) => s.get(songId));
  if (!blob) throw new Error('Audio file missing from browser storage');
  const url = URL.createObjectURL(blob);
  blobUrls.set(songId, url);
  return url;
}

export async function deleteAudio(songId: string, _storedUri: string): Promise<void> {
  try {
    await request('readwrite', (s) => s.delete(songId));
  } catch (err) {
    console.warn('Failed to delete audio blob:', err);
  }
  const url = blobUrls.get(songId);
  if (url) {
    URL.revokeObjectURL(url);
    blobUrls.delete(songId);
  }
}

export async function writeGeneratedWav(_name: string, bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  return URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
}
