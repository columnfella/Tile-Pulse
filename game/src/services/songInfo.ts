/**
 * Online song lookup — no API keys needed.
 *
 * Search & browsing: Deezer's public catalogue API (https://developers.deezer.com)
 * — mainstream, popularity-ranked results with artist pages.
 *
 * Tempo: Deezer's own `bpm` field when it has one; otherwise the track's ISRC
 * is matched to MusicBrainz (https://musicbrainz.org) and the measured BPM is
 * read from AcousticBrainz (https://acousticbrainz.org), both open CC0 data.
 *
 * No free database provides time signatures, so that is reported as not found.
 */

import { Platform } from 'react-native';

const DEEZER = 'https://api.deezer.com';
const MB = 'https://musicbrainz.org/ws/2';
const AB_LOWLEVEL = 'https://acousticbrainz.org/api/v1/low-level';
// MusicBrainz asks API clients to identify themselves (browsers set their own User-Agent)
const USER_AGENT = 'TilePulse/1.0';

export interface OnlineTrack {
  id: number;
  title: string;
  artist: string;
  album?: string;
  durationSeconds?: number;
  coverUrl?: string;
}

export interface OnlineArtist {
  id: number;
  name: string;
  fans: number;
  pictureUrl?: string;
}

export interface SongTempoInfo {
  /** Rounded BPM, or null when not found. */
  bpm: number | null;
  /** Which database the BPM came from. */
  source: 'Deezer' | 'AcousticBrainz' | null;
  /** Always null for now — no open database provides time signatures. */
  timeSignature: string | null;
}

interface DeezerTrack {
  id: number;
  title: string;
  duration?: number;
  bpm?: number;
  isrc?: string;
  artist?: { name: string };
  album?: { title: string; cover_small?: string };
}

interface DeezerArtist {
  id: number;
  name: string;
  nb_fan?: number;
  picture_small?: string;
}

async function getJson<T>(url: string, signal?: AbortSignal, withAgent = false): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (withAgent && Platform.OS !== 'web') headers['User-Agent'] = USER_AGENT;
  const res = await fetch(url, { headers, signal });
  if (!res.ok) {
    throw new Error(res.status === 503 || res.status === 429 ? 'The service is busy — try again in a moment.' : `Request failed (${res.status})`);
  }
  const json = (await res.json()) as T & { error?: { message?: string } };
  if (json && typeof json === 'object' && 'error' in json && json.error) {
    throw new Error(json.error.message || 'The music service returned an error.');
  }
  return json;
}

const toTrack = (t: DeezerTrack): OnlineTrack => ({
  id: t.id,
  title: t.title,
  artist: t.artist?.name ?? 'Unknown artist',
  album: t.album?.title,
  durationSeconds: t.duration,
  coverUrl: t.album?.cover_small,
});

/** Removes repeats of the same song (deluxe editions, re-releases…). */
function dedupe(tracks: OnlineTrack[]): OnlineTrack[] {
  const seen = new Set<string>();
  return tracks.filter((t) => {
    const key = `${t.title.toLowerCase().replace(/\s*\(.*?\)\s*/g, '')}|${t.artist.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** "Song" mode: search by song title. */
export async function searchTracks(title: string, signal?: AbortSignal): Promise<OnlineTrack[]> {
  const q = encodeURIComponent(`track:"${title.trim().replace(/"/g, '')}"`);
  const data = await getJson<{ data?: DeezerTrack[] }>(`${DEEZER}/search?q=${q}&limit=40`, signal);
  return dedupe((data.data ?? []).map(toTrack)).slice(0, 25);
}

/** "Artist" mode: find artists by name. */
export async function searchArtists(name: string, signal?: AbortSignal): Promise<OnlineArtist[]> {
  const q = encodeURIComponent(name.trim());
  const data = await getJson<{ data?: DeezerArtist[] }>(`${DEEZER}/search/artist?q=${q}&limit=15`, signal);
  return (data.data ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    fans: a.nb_fan ?? 0,
    pictureUrl: a.picture_small,
  }));
}

/** An artist's most popular songs. */
export async function getArtistTopTracks(artistId: number, signal?: AbortSignal): Promise<OnlineTrack[]> {
  const data = await getJson<{ data?: DeezerTrack[] }>(`${DEEZER}/artist/${artistId}/top?limit=50`, signal);
  return dedupe((data.data ?? []).map(toTrack));
}

/** "Song by artist" mode: a song title, limited to one artist. */
export async function searchTrackByArtist(
  artist: string,
  title: string,
  signal?: AbortSignal
): Promise<OnlineTrack[]> {
  const q = encodeURIComponent(`${artist.trim()} ${title.trim()}`);
  const data = await getJson<{ data?: DeezerTrack[] }>(`${DEEZER}/search?q=${q}&limit=50`, signal);
  const wanted = artist.trim().toLowerCase();
  const matches = (data.data ?? [])
    .map(toTrack)
    .filter((t) => t.artist.toLowerCase().includes(wanted) || wanted.includes(t.artist.toLowerCase()));
  return dedupe(matches).slice(0, 25);
}

/** Median of measured BPMs on AcousticBrainz for the recordings with this ISRC. */
async function acousticBrainzBpmForIsrc(isrc: string, signal?: AbortSignal): Promise<number | null> {
  const mb = await getJson<{ recordings?: { id: string }[] }>(
    `${MB}/isrc/${encodeURIComponent(isrc)}?fmt=json`,
    signal,
    true
  );
  const ids = (mb.recordings ?? []).map((r) => r.id).slice(0, 25);
  if (ids.length === 0) return null;

  const ab = await getJson<Record<string, Record<string, { rhythm?: { bpm?: number } }>>>(
    `${AB_LOWLEVEL}?recording_ids=${ids.join(';')}&features=rhythm.bpm`,
    signal
  );
  const bpms: number[] = [];
  for (const id of Object.keys(ab)) {
    if (id === 'mbid_mapping') continue;
    for (const sub of Object.values(ab[id] ?? {})) {
      const bpm = sub?.rhythm?.bpm;
      if (typeof bpm === 'number' && bpm > 0) bpms.push(bpm);
    }
  }
  if (bpms.length === 0) return null;
  bpms.sort((a, b) => a - b);
  return Math.round(bpms[Math.floor(bpms.length / 2)]);
}

/** Looks up a track's tempo: Deezer first, then AcousticBrainz via ISRC. */
export async function lookupSongTempo(track: OnlineTrack, signal?: AbortSignal): Promise<SongTempoInfo> {
  const detail = await getJson<DeezerTrack>(`${DEEZER}/track/${track.id}`, signal);
  if (detail.bpm && detail.bpm > 0) {
    return { bpm: Math.round(detail.bpm), source: 'Deezer', timeSignature: null };
  }
  if (detail.isrc) {
    try {
      const bpm = await acousticBrainzBpmForIsrc(detail.isrc, signal);
      if (bpm) return { bpm, source: 'AcousticBrainz', timeSignature: null };
    } catch (err) {
      if (signal?.aborted) throw err;
      console.warn('AcousticBrainz lookup failed:', err);
    }
  }
  return { bpm: null, source: null, timeSignature: null };
}
