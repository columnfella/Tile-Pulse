/**
 * The menu music playlist: every audio file in src/assets/audio/menu/ is
 * bundled automatically (Metro's require.context) — just drop files in that
 * folder. A song's credits go in a .json file with the same name next to it
 * ("Artist - Song.mp3" + "Artist - Song.json"); see the README there.
 */

export interface TrackCredit {
  song: string;
  composer?: string;
  website?: string;
  license?: string;
  licenseUrl?: string;
  poweredBy?: string;
  poweredByUrl?: string;
}

export interface MenuTrack {
  /** From the file name: "Neon Skies - Artist.mp3" → "Neon Skies - Artist". */
  title: string;
  /** Bundled asset (pass to the audio player). */
  source: number;
  /** Shown in the "now playing" pop-up and in Settings. */
  credit: TrackCredit | null;
}

const audioFiles = require.context('../assets/audio/menu', false, /\.(mp3|m4a|aac|wav)$/i);
const creditFiles = require.context('../assets/audio/menu', false, /\.json$/i);

const baseName = (key: string) => key.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
const titleOf = (key: string) => baseName(key).replace(/[_]+/g, ' ').trim();

/** Credits by file base name (a broken JSON file is skipped). */
const credits = new Map<string, TrackCredit>();
for (const key of creditFiles.keys()) {
  try {
    const c = creditFiles(key);
    const value = (c && c.default) || c;
    if (value && typeof value.song === 'string') credits.set(baseName(key).toLowerCase(), value as TrackCredit);
  } catch {
    /* ignore */
  }
}

export const MENU_TRACKS: MenuTrack[] = audioFiles
  .keys()
  // Metro can list one file under two keys; keep each title once
  .filter((key, i, all) => all.findIndex((k) => titleOf(k) === titleOf(key)) === i)
  .sort((a, b) => titleOf(a).localeCompare(titleOf(b)))
  .map((key) => ({
    title: titleOf(key),
    source: audioFiles(key) as number,
    credit: credits.get(baseName(key).toLowerCase()) ?? null,
  }));
