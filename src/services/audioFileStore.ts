/**
 * Native (iOS / Android) audio file persistence using expo-file-system.
 * A web implementation with the same exports lives in audioFileStore.web.ts.
 */

import { Directory, File, Paths } from 'expo-file-system';
import type { PickedAudioResult } from './documentPicker';

function audioDir(): Directory {
  const dir = new Directory(Paths.document, 'audio');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

function extensionOf(name?: string): string {
  const match = name?.match(/\.([a-z0-9]+)$/i);
  return match ? match[1].toLowerCase() : 'mp3';
}

/**
 * Copies a picked audio file out of the (purgeable) cache directory into the
 * app's document directory and returns the persistent file URI.
 */
export async function saveImportedAudio(songId: string, picked: PickedAudioResult): Promise<string> {
  if (!picked.uri) throw new Error('No audio file selected');
  const dest = new File(audioDir(), `${songId}.${extensionOf(picked.name)}`);
  if (dest.exists) dest.delete();
  await new File(picked.uri).copy(dest);
  return dest.uri;
}

export async function resolveAudioUri(_songId: string, storedUri: string): Promise<string> {
  return storedUri;
}

export async function deleteAudio(_songId: string, storedUri: string): Promise<void> {
  try {
    if (!storedUri.startsWith('file:')) return;
    const file = new File(storedUri);
    if (file.exists) file.delete();
  } catch (err) {
    console.warn('Failed to delete audio file:', err);
  }
}

/** Writes generated WAV bytes to the cache directory and returns a playable URI. */
export async function writeGeneratedWav(name: string, bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const file = new File(Paths.cache, `${name}.wav`);
  if (file.exists) file.delete();
  file.create();
  await file.write(bytes);
  return file.uri;
}
