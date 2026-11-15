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
  /** Original file on the device it was imported from (used to spot duplicates). */
  sourceUri?: string;
}
