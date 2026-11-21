import type { DifficultyVotes } from './social';
/**
 * Client for the TilePulse backend's community level browser (backend/src/routes/levels.js).
 *
 * Server address: EXPO_PUBLIC_API_URL if set, then SERVER_URL from
 * serverAddress.ts (the deployed server, kept up to date by the deploy script),
 * otherwise the computer running the Expo dev server on port 4000 (works for
 * phones on the same Wi-Fi when the backend listens on HOST=0.0.0.0).
 */
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { Song, TileNote } from '../types/song';
import { storageService } from './storage';
import { saveRemoteAudio } from './audioFileStore';
import { isBackgroundId } from '../components/backgrounds/AnimatedBackground';
import { getDeviceId } from './device';
import { SERVER_URL } from './serverAddress';

const REQUEST_TIMEOUT_MS = 10_000;

function resolveApiBase(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  if (SERVER_URL) return SERVER_URL.replace(/\/+$/, '');
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:4000`;
  }
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  return `http://${host || '127.0.0.1'}:4000`;
}

export const API_BASE = resolveApiBase();

export type Difficulty = 'easy' | 'normal' | 'hard' | 'expert';
export type LevelSort = 'newest' | 'popular' | 'liked' | 'stars' | 'easiest' | 'hardest' | 'shortest' | 'longest' | 'title';
export type SearchField = 'all' | 'level' | 'song' | 'artist' | 'author';
export type NoteFilter = 'any' | 'taps' | 'holds';
export type CopyMode = 'free' | 'password' | 'none';

export interface LevelFilters {
  q?: string;
  in?: SearchField;
  difficulty?: Difficulty[];
  minLevel?: number;
  maxLevel?: number;
  minBpm?: number;
  maxBpm?: number;
  minDurationSec?: number;
  maxDurationSec?: number;
  notes?: NoteFilter;
  hasAudio?: boolean;
  hasCover?: boolean;
  /** Only levels verified by a moderator (these count for the leaderboard). */
  verified?: boolean;
  sort?: LevelSort;
  limit?: number;
  offset?: number;
}

export interface CommunityLevel {
  id: string;
  name: string;
  difficulty: Difficulty;
  level: number;
  noteCount: number;
  holdCount: number;
  plays: number;
  version: number;
  /** team: made by the TilePulse team (owner / developers). */
  author: { id: string; displayName: string; team?: boolean };
  /** Built-in background id chosen by the mapper (may be unknown to older app versions). */
  background: string | null;
  shader: { id: string; name: string } | null;
  cover: { sha256: string } | null;
  description: string | null;
  /** Who may copy the level into their editor. */
  copy: CopyMode;
  likes: number;
  dislikes: number;
  /** likes − dislikes (can be negative) */
  score: number;
  comments: number;
  /** Star difficulty (1–8) voted by players who finished it. */
  difficultyVotes: DifficultyVotes;
  /** Verified by a moderator: only these levels give leaderboard points. */
  verified?: boolean;
  song: {
    id: string;
    title: string;
    artist: string | null;
    bpm: number;
    timeSignature: { beatsPerMeasure: number; beatUnit: number };
    durationMs: number | null;
    audio: { mimeType: string; sizeBytes: number; sha256?: string } | null;
  };
  createdAt: number;
  updatedAt: number;
}

/** The server answered with an error (its message is meant for players, unless it's a 5xx). */
export class ApiRequestError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export class ApiUnavailableError extends Error {
  constructor() {
    super('Community server is offline.');
    this.name = 'ApiUnavailableError';
  }
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), REQUEST_TIMEOUT_MS);
  const onAbort = () => timeout.abort();
  signal?.addEventListener('abort', onAbort);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/v1${path}`, {
      signal: timeout.signal,
      headers: { Accept: 'application/json', 'X-Device-Id': await getDeviceId() },
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new ApiUnavailableError();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiRequestError(res.status, typeof body?.error === 'string' ? body.error : `Request failed (${res.status})`);
  return body as T;
}

export async function searchLevels(
  filters: LevelFilters,
  signal?: AbortSignal
): Promise<{ levels: CommunityLevel[]; nextOffset: number | null }> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) continue;
    params.set(key, Array.isArray(value) ? value.join(',') : String(value));
  }
  return getJson(`/levels?${params.toString()}`, signal);
}

const EXTENSIONS: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/ogg': 'ogg',
  'audio/flac': 'flac',
};

/** URL of a level's cover picture (the hash makes it change when the picture does). */
export const coverUrl = (level: CommunityLevel) =>
  level.cover ? `${API_BASE}/api/v1/levels/${level.id}/cover?v=${level.cover.sha256.slice(0, 12)}` : null;

/** Current versions of levels (missing = deleted or made private). */
export async function getLevelVersions(ids: string[]): Promise<{ id: string; version: number; updatedAt: number }[]> {
  if (!ids.length) return [];
  const r = await getJson<{ levels: { id: string; version: number; updatedAt: number }[] }>(
    `/levels/versions?ids=${encodeURIComponent(ids.slice(0, 100).join(','))}`
  );
  return r.levels;
}

/** Local song id for a downloaded level (so downloading twice updates it instead of duplicating). */
export const localIdForLevel = (levelId: string) => `community_${levelId}`;

/** Downloads a level (notes + audio) into the local library and returns the saved song. */
export async function downloadLevel(level: Pick<CommunityLevel, 'id'>): Promise<Song> {
  const { level: full } = await getJson<{ level: CommunityLevel & { notes: Omit<TileNote, 'id'>[] } }>(
    `/levels/${level.id}`
  );
  if (!full.song.audio) throw new Error('This level has no audio uploaded yet.');

  const id = localIdForLevel(full.id);
  // Updating a level you already have: keep the audio when it didn't change
  const existing = await storageService.getSongById(id).catch(() => null);
  const sameAudio =
    !!existing?.audioUri && !!full.song.audio.sha256 && existing.community?.audioSha256 === full.song.audio.sha256;
  const audioUri = sameAudio
    ? existing!.audioUri
    : await saveRemoteAudio(id, `${API_BASE}/api/v1/levels/${full.id}/audio`, EXTENSIONS[full.song.audio.mimeType] ?? 'mp3');
  const song: Song = {
    id,
    title: full.song.title,
    artist: full.song.artist ?? undefined,
    audioUri,
    bpm: full.song.bpm,
    timeSignature: full.song.timeSignature,
    tiles: full.notes.map((n, i) => ({ ...n, id: `${id}_${i}` })),
    createdAt: Date.now(),
    durationSeconds: full.song.durationMs ? full.song.durationMs / 1000 : undefined,
    // Use the mapper's background when this app version knows it
    background: isBackgroundId(full.background) ? full.background : undefined,
    community: {
      levelId: full.id,
      name: full.name,
      difficulty: full.difficulty,
      level: full.level,
      author: full.author.displayName,
      team: !!full.author.team,
      version: full.version,
      audioSha256: full.song.audio.sha256,
    },
  };
  // Keep the level's cover picture with the song (optional: a failed download isn't fatal)
  const cover = coverUrl(full);
  if (cover) {
    try {
      song.coverUri = await storageService.saveRemoteCover(id, cover);
    } catch (err) {
      console.warn('Cover download failed:', err);
    }
  }
  await storageService.saveSong(song);
  return song;
}
