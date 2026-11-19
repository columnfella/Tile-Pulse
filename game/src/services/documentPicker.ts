import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as MediaLibrary from 'expo-media-library/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File } from 'expo-file-system';

const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'flac', 'mp4', '3gp', 'amr']);
const SAVED_FOLDER_KEY = 'tilepulse_audio_folder_v1';
const MAX_SCAN_DEPTH = 6;
const MAX_SCAN_FILES = 2000;

/** Whether a folder can be picked and scanned (Android & iOS). */
export const supportsFolderScan = Platform.OS === 'android' || Platform.OS === 'ios';

function isAudioName(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase();
  return !!ext && AUDIO_EXTENSIONS.has(ext);
}

/** Recursively collects audio files under a folder (depth- and count-limited). */
function scanDirectory(dir: Directory, depth: number, out: DeviceAudioFile[]): void {
  if (depth > MAX_SCAN_DEPTH || out.length >= MAX_SCAN_FILES) return;
  let entries: (Directory | File)[] = [];
  try {
    entries = dir.list();
  } catch (err) {
    console.warn('Could not list folder:', dir.uri, err);
    return;
  }
  for (const entry of entries) {
    if (out.length >= MAX_SCAN_FILES) return;
    if (entry instanceof Directory) {
      if (!entry.name.startsWith('.')) scanDirectory(entry, depth + 1, out);
    } else if (isAudioName(entry.name)) {
      out.push({ id: entry.uri, name: entry.name, uri: entry.uri, durationSeconds: 0, modifiedAt: 0 });
    }
  }
}

function scanFolderUri(uri: string): DeviceAudioFile[] {
  const files: DeviceAudioFile[] = [];
  scanDirectory(new Directory(uri), 0, files);
  return files.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Opens the system "allow access to a folder" screen. The user grants
 * TilePulse access to one folder (e.g. Music or Download) and we scan it and
 * its subfolders for audio. Access is remembered for next time.
 * Works in Expo Go, unlike full media-library access on Android.
 */
export async function pickAndScanAudioFolder(): Promise<DeviceAudioResult | { status: 'canceled' }> {
  if (!supportsFolderScan) return { status: 'unavailable' };
  let dir: Directory;
  try {
    dir = await Directory.pickDirectoryAsync();
  } catch {
    return { status: 'canceled' }; // user backed out of the folder picker
  }
  await AsyncStorage.setItem(SAVED_FOLDER_KEY, dir.uri).catch(() => {});
  try {
    return { status: 'ok', files: scanFolderUri(dir.uri), source: 'folder', folderName: dir.name };
  } catch (err) {
    console.warn('Folder scan failed:', err);
    return { status: 'unavailable' };
  }
}

/** Re-scans the folder the user granted access to earlier, if still accessible. */
export async function scanSavedAudioFolder(): Promise<DeviceAudioResult | null> {
  if (!supportsFolderScan) return null;
  try {
    const uri = await AsyncStorage.getItem(SAVED_FOLDER_KEY);
    if (!uri) return null;
    const dir = new Directory(uri);
    if (!dir.exists) return null;
    return { status: 'ok', files: scanFolderUri(uri), source: 'folder', folderName: dir.name };
  } catch {
    return null; // access was revoked or the folder is gone
  }
}

export interface DeviceAudioFile {
  id: string;
  name: string;
  uri: string;
  durationSeconds: number;
  modifiedAt: number;
}

export type DeviceAudioResult =
  | { status: 'ok'; files: DeviceAudioFile[]; source: 'library' | 'folder'; folderName?: string }
  | { status: 'denied' }
  | { status: 'unavailable' };

/** Whether an in-app list of the phone's audio files is supported (Android only). */
export const supportsDeviceAudioLibrary = Platform.OS === 'android';

/**
 * Lists audio files stored on the device (Music, Downloads, recordings…)
 * through the media library, newest first. Android only — iOS has no public
 * API for the user's audio files, so callers fall back to the system picker.
 */
export type AudioPermissionState =
  | 'granted'
  | 'undetermined' // never asked, or can still ask
  | 'blocked' // denied permanently; only the system Settings can change it
  | 'unavailable';

/** Reads the current audio permission without prompting the user. */
export async function getAudioPermissionState(): Promise<AudioPermissionState> {
  if (!supportsDeviceAudioLibrary) return 'unavailable';
  try {
    const p = await MediaLibrary.getPermissionsAsync(false, ['audio']);
    if (p.granted) return 'granted';
    return p.canAskAgain ? 'undetermined' : 'blocked';
  } catch (err) {
    console.warn('Could not read audio permission:', err);
    return 'unavailable';
  }
}

/** Shows the system permission dialog. Call only after the user agreed in-app. */
export async function requestAudioPermission(): Promise<AudioPermissionState> {
  if (!supportsDeviceAudioLibrary) return 'unavailable';
  try {
    const p = await MediaLibrary.requestPermissionsAsync(false, ['audio']);
    if (p.granted) return 'granted';
    return p.canAskAgain ? 'undetermined' : 'blocked';
  } catch (err) {
    console.warn('Audio permission request failed:', err);
    return 'unavailable';
  }
}

/** Lists the device's audio files. Requires the audio permission to be granted first. */
export async function loadDeviceAudioFiles(): Promise<DeviceAudioResult> {
  if (!supportsDeviceAudioLibrary) return { status: 'unavailable' };
  try {
    const permission = await MediaLibrary.getPermissionsAsync(false, ['audio']);
    if (!permission.granted) return { status: 'denied' };

    const files: DeviceAudioFile[] = [];
    let after: string | undefined;
    // Page through the library (capped so huge libraries stay responsive)
    for (let page = 0; page < 10; page++) {
      const result = await MediaLibrary.getAssetsAsync({
        mediaType: MediaLibrary.MediaType.audio,
        sortBy: [[MediaLibrary.SortBy.modificationTime, false]],
        first: 200,
        after,
      });
      for (const asset of result.assets) {
        files.push({
          id: asset.id,
          name: asset.filename,
          uri: asset.uri,
          durationSeconds: asset.duration,
          modifiedAt: asset.modificationTime,
        });
      }
      if (!result.hasNextPage) break;
      after = result.endCursor;
    }
    return { status: 'ok', files, source: 'library' };
  } catch (err) {
    console.warn('Device audio library unavailable:', err);
    return { status: 'unavailable' };
  }
}

export interface PickedAudioResult {
  canceled: boolean;
  name?: string;
  uri?: string;
  /** Web only: the underlying File object, used to persist it in IndexedDB. */
  file?: Blob;
  size?: number;
}

/**
 * Opens the system file picker for an audio file.
 * expo-document-picker works on iOS, Android and web.
 */
export async function pickAudioDocument(): Promise<PickedAudioResult> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['audio/*'],
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled || !result.assets?.length) {
    return { canceled: true };
  }

  const asset = result.assets[0];
  return {
    canceled: false,
    name: asset.name,
    uri: asset.uri,
    file: asset.file,
    size: asset.size,
  };
}
