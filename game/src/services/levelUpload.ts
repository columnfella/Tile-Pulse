/**
 * Publishes a local song + beatmap to the community server as a level.
 * Re-uploading the same song updates the existing level instead of making a
 * duplicate (the server ids are remembered per local song).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Song } from '../types/song';
import { API_BASE, type Difficulty, type CopyMode } from './communityApi';
import { ApiError, apiRequest, getSession } from './account';
import { putFile } from './binaryUpload';
import { storageService } from './storage';
import { saveRemoteAudio } from './audioFileStore';

const UPLOADS_KEY = 'tilepulse_uploads_v1';

export interface UploadRecord {
  songId: string; // server song id (s_…)
  levelId: string; // server beatmap id (b_…)
  name: string;
  difficulty: Difficulty;
  level: number;
  visibility: 'public' | 'unlisted';
  background: string | null;
  shaderId: string | null;
  hasCover: boolean;
  uploadedAt: number;
  description?: string;
  copyMode?: CopyMode;
}

export interface UploadOptions {
  name: string;
  difficulty: Difficulty;
  level: number;
  visibility: 'public' | 'unlisted';
  /** Built-in background id, or null for the song's own background. */
  background: string | null;
  /** Approved player shader, or null. */
  shaderId: string | null;
  /** New cover picture to upload (local file URI), "remove", or undefined to keep. */
  cover?: string | 'remove';
  /** Shown on the level's page. */
  description: string;
  /** Who may copy the level into their editor. */
  copyMode: CopyMode;
  /** New copy password (only when setting / changing it). */
  copyPassword?: string;
}

export type UploadStep = 'song' | 'audio' | 'level' | 'cover' | 'done';

async function readRecords(): Promise<Record<string, UploadRecord>> {
  try {
    const raw = await AsyncStorage.getItem(UPLOADS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export async function getUploadRecord(localSongId: string): Promise<UploadRecord | null> {
  return (await readRecords())[localSongId] ?? null;
}

/**
 * Deletes one of your uploaded levels from the server (its song and audio go too
 * when nothing else uses them) and forgets the local upload link to it.
 */
export async function deleteUploadedLevel(levelId: string): Promise<void> {
  await apiRequest('DELETE', `/beatmaps/${levelId}`);
  const all = await readRecords();
  let changed = false;
  for (const [localId, r] of Object.entries(all)) {
    if (r.levelId === levelId) {
      delete all[localId];
      changed = true;
    }
  }
  if (changed) await AsyncStorage.setItem(UPLOADS_KEY, JSON.stringify(all));
}

async function saveRecord(localSongId: string, record: UploadRecord) {
  const all = await readRecords();
  all[localSongId] = record;
  await AsyncStorage.setItem(UPLOADS_KEY, JSON.stringify(all));
}

const isNotFound = (err: unknown) => err instanceof ApiError && err.status === 404;

async function putBinary(path: string, fileUri: string, what: string) {
  const session = await getSession();
  if (!session) throw new Error('Sign in to upload.');
  const res = await putFile(`${API_BASE}/api/v1${path}`, fileUri, session.token);
  if (res.status >= 200 && res.status < 300) return;
  let message = `${what} upload failed (${res.status})`;
  try {
    const body = JSON.parse(res.body);
    if (typeof body?.error === 'string') message = body.error;
  } catch {
    /* not JSON */
  }
  throw new Error(message);
}

/** Uploads (or updates) the level; reports progress through onStep. Returns the level id. */
export async function uploadLevel(
  song: Song,
  options: UploadOptions,
  onStep: (step: UploadStep) => void = () => {}
): Promise<UploadRecord> {
  if (!(await getSession())) throw new Error('Sign in to upload.');
  if (song.audioUri.startsWith('synthesized:')) throw new Error('Built-in songs can’t be uploaded — import your own audio.');
  if (song.tiles.length === 0) throw new Error('Add some notes before uploading.');

  const previous = await getUploadRecord(song.id);
  const songFields = {
    title: song.title.slice(0, 120),
    artist: song.artist ? song.artist.slice(0, 120) : null,
    bpm: song.bpm,
    beatsPerMeasure: song.timeSignature.beatsPerMeasure,
    beatUnit: song.timeSignature.beatUnit,
    durationMs: song.durationSeconds ? Math.round(song.durationSeconds * 1000) : null,
    visibility: options.visibility,
  };

  // 1) Song: update the one uploaded before, or create it
  onStep('song');
  let serverSong: { id: string; hasAudio: boolean } | null = null;
  if (previous) {
    try {
      serverSong = (await apiRequest<{ song: { id: string; hasAudio: boolean } }>('PATCH', `/songs/${previous.songId}`, { json: songFields })).song;
    } catch (err) {
      if (!isNotFound(err)) throw err; // deleted on the server: create it again below
    }
  }
  if (!serverSong) {
    serverSong = (await apiRequest<{ song: { id: string; hasAudio: boolean } }>('POST', '/songs', { json: songFields })).song;
  }

  // 2) Audio (only when the server doesn't have it yet)
  if (!serverSong.hasAudio) {
    onStep('audio');
    const uri = await storageService.getAudioUriForSong(song);
    await putBinary(`/songs/${serverSong.id}/audio`, uri, 'Audio');
  }

  // 3) Level (beatmap)
  onStep('level');
  const levelFields = {
    name: options.name.trim().slice(0, 60),
    difficulty: options.difficulty,
    level: options.level,
    notes: song.tiles.map((t) => ({
      lane: t.lane,
      beat: t.beat,
      durationBeats: t.durationBeats,
      ...(t.path && t.path.length >= 2 && t.durationBeats > 0 ? { path: t.path } : {}),
    })),
    background: options.background,
    shaderId: options.shaderId,
    description: options.description.trim().slice(0, 500) || null,
    copyMode: options.copyMode,
    ...(options.copyMode === 'password' && options.copyPassword ? { copyPassword: options.copyPassword } : {}),
  };
  let levelId: string | null = null;
  if (previous && previous.songId === serverSong.id) {
    try {
      const current = await apiRequest<{ beatmap: { version: number } }>('GET', `/beatmaps/${previous.levelId}`);
      await apiRequest('PUT', `/beatmaps/${previous.levelId}`, { json: { ...levelFields, version: current.beatmap.version } });
      levelId = previous.levelId;
    } catch (err) {
      if (!isNotFound(err)) throw err;
    }
  }
  if (!levelId) {
    try {
      levelId = (await apiRequest<{ beatmap: { id: string } }>('POST', `/songs/${serverSong.id}/beatmaps`, { json: levelFields })).beatmap.id;
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) throw new Error('This song already has a level with that name — pick another name.');
      throw err;
    }
  }

  // 4) Cover picture
  let hasCover = previous?.hasCover ?? false;
  if (options.cover === 'remove') {
    onStep('cover');
    await apiRequest('DELETE', `/beatmaps/${levelId}/cover`);
    hasCover = false;
  } else if (options.cover) {
    onStep('cover');
    await putBinary(`/beatmaps/${levelId}/cover`, options.cover, 'Cover');
    hasCover = true;
  }

  const record: UploadRecord = {
    songId: serverSong.id,
    levelId,
    name: levelFields.name,
    difficulty: options.difficulty,
    level: options.level,
    visibility: options.visibility,
    background: options.background,
    shaderId: options.shaderId,
    hasCover,
    uploadedAt: Date.now(),
    description: options.description.trim().slice(0, 500),
    copyMode: options.copyMode,
  };
  await saveRecord(song.id, record);
  onStep('done');
  return record;
}

export interface CommunityShader {
  id: string;
  name: string;
  description: string | null;
  palette: string[] | null;
  author: { displayName: string };
}

export async function listShaders(): Promise<CommunityShader[]> {
  return (await apiRequest<{ shaders: CommunityShader[] }>('GET', '/shaders?limit=50', { auth: false })).shaders;
}

/* ------------------------- editing your uploaded levels ------------------------ */

/** The local song linked to one of your uploaded levels (null when not on this device). */
export async function findLocalSongForLevel(levelId: string): Promise<string | null> {
  const all = await readRecords();
  const hit = Object.entries(all).find(([, r]) => r.levelId === levelId);
  if (!hit) return null;
  const exists = await storageService.getSongById(hit[0]).catch(() => null);
  return exists ? hit[0] : null;
}

/**
 * Downloads one of your uploaded levels into your editor (notes, audio, cover),
 * linked to the online level: uploading it again updates that level for
 * everyone instead of posting a new one.
 */
export async function downloadForEditing(levelId: string, visibility: 'public' | 'unlisted'): Promise<Song> {
  const existing = await findLocalSongForLevel(levelId);
  if (existing) return (await storageService.getSongById(existing))!;

  const { level } = await apiRequest<{
    level: {
      id: string;
      name: string;
      difficulty: Difficulty;
      level: number;
      background: string | null;
      shader: { id: string } | null;
      cover: { sha256: string } | null;
      description: string | null;
      copy: CopyMode;
      song: {
        id: string;
        title: string;
        artist: string | null;
        bpm: number;
        timeSignature: { beatsPerMeasure: number; beatUnit: number };
        durationMs: number | null;
        audio: { mimeType: string } | null;
      };
      notes: { lane: 0 | 1 | 2 | 3; beat: number; durationBeats: number; path?: { beat: number; x: number }[] }[];
    };
  }>('GET', `/levels/${levelId}`, { auth: false });
  if (!level.song.audio) throw new Error('This level has no audio online.');

  const id = `edit_${level.id}`;
  const ext = level.song.audio.mimeType.includes('wav') ? 'wav' : level.song.audio.mimeType.includes('mp4') ? 'm4a' : level.song.audio.mimeType.includes('ogg') ? 'ogg' : level.song.audio.mimeType.includes('flac') ? 'flac' : 'mp3';
  const audioUri = await saveRemoteAudio(id, `${API_BASE}/api/v1/levels/${level.id}/audio`, ext);
  const song: Song = {
    id,
    title: level.song.title,
    artist: level.song.artist ?? undefined,
    audioUri,
    bpm: level.song.bpm,
    timeSignature: level.song.timeSignature,
    tiles: level.notes.map((n, i) => ({ ...n, id: `${id}_${i}` })) as Song['tiles'],
    createdAt: Date.now(),
    durationSeconds: level.song.durationMs ? level.song.durationMs / 1000 : undefined,
    background: (level.background ?? undefined) as Song['background'],
  };
  if (level.cover) {
    try {
      song.coverUri = await storageService.saveRemoteCover(id, `${API_BASE}/api/v1/levels/${level.id}/cover?v=${level.cover.sha256.slice(0, 12)}`);
    } catch {
      /* no cover locally: the online one stays */
    }
  }
  await storageService.saveSong(song);
  await saveRecord(id, {
    songId: level.song.id,
    levelId: level.id,
    name: level.name,
    difficulty: level.difficulty,
    level: level.level,
    visibility,
    background: level.background,
    shaderId: level.shader?.id ?? null,
    hasCover: !!level.cover,
    uploadedAt: Date.now(),
    description: level.description ?? '',
    copyMode: level.copy,
  });
  return song;
}
