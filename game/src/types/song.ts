/**
 * Core Song & Beatmap Data Model
 * Extensible for future mechanics, audio formats, and custom beatmap layers.
 */

export interface TileNote {
  id: string;
  lane: 0 | 1 | 2 | 3;
  beat: number;          // Start beat (e.g., 1.0, 1.5, 2.0)
  durationBeats: number; // 0 = Normal Tap Tile, > 0 = Hold Tile
  /**
   * Slide tile: a hold whose position moves across the lanes along this path.
   * Needs at least 2 points and durationBeats > 0. Each bend is a point, so a
   * single tile can change direction as often as you like.
   */
  path?: SlidePoint[];
}

/** One corner of a slide tile's path. */
export interface SlidePoint {
  /** Beats after the tile's start (0 … durationBeats). */
  t: number;
  /** Lane position of the tile's left edge: 0 = lane 1 … 3 = lane 4; halves allowed. */
  x: number;
}

/**
 * Editor guide line, recorded by tapping along with the music (like the
 * guidelines in rhythm-game level editors). Stored in seconds of audio, so
 * guides stay on the music even if the BPM is changed later.
 */
export interface GuideMark {
  /** Position in the song, in seconds. */
  t: number;
  /** Guide colour/type index (see GUIDE_TYPES in the editor). */
  type: number;
}

export interface Song {
  id: string;
  title: string;
  audioUri: string;
  bpm: number;
  timeSignature: {
    beatsPerMeasure: number; // e.g., 4
    beatUnit: number;        // e.g., 4
  };
  tiles: TileNote[];
  createdAt: number;
  durationSeconds?: number;
  artist?: string;
  /** Animated background for this song; "default" (or missing) follows the app theme. */
  background?: string;
  /** Original file on the device it was imported from (used to spot duplicates). */
  sourceUri?: string;
  /** Editor-only guide lines (not shown in the game). */
  guides?: GuideMark[];
  /** Cover picture stored on the device (shown on the song's card). */
  coverUri?: string;
  /** Set when the song was downloaded from Discover. */
  community?: {
    levelId: string;
    name: string;
    difficulty: 'easy' | 'normal' | 'hard' | 'expert';
    level: number;
    author: string;
    /** Made by the TilePulse team (gets a piano photo when it has no cover). */
    team?: boolean;
    /** Server version when downloaded: a newer one is downloaded automatically. */
    version?: number;
    /** Fingerprint of the downloaded cover picture (a new cover online is downloaded). */
    coverSha256?: string | null;
    /** Fingerprint of the downloaded audio (re-downloaded only when it changes). */
    audioSha256?: string;
  };
}
