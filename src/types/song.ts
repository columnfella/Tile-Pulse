/**
 * Core Song & Beatmap Data Model
 * Extensible for future mechanics, audio formats, and custom beatmap layers.
 */

export interface TileNote {
  id: string;
  lane: 0 | 1 | 2 | 3;
  beat: number;          // Start beat (e.g., 1.0, 1.5, 2.0)
  durationBeats: number; // 0 = Normal Tap Tile, > 0 = Hold Tile
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
}
