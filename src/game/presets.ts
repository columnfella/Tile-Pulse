/**
 * Built-in preset songs. All are public-domain compositions whose audio is
 * synthesized by the app itself (see src/audio/synth.ts), so there is no
 * copyrighted recording involved.
 */

import type { Song, TileNote } from '../types/song';
import { STARTER_MELODY, STARTER_SONG, type MelodyNote } from './starterSong';

export interface PresetSong {
  song: Song;
  melody: MelodyNote[];
  beatsPerMeasure: number;
}

/* ------------------------------------------------------------------------ *
 * "Ode to Joy" — Ludwig van Beethoven, Symphony No. 9 (1824). Public domain.
 * Melody in C major, 4/4. One measure of metronome count-in before it starts.
 * ------------------------------------------------------------------------ */

const F = {
  G3: 196.0,
  C4: 261.63,
  D4: 293.66,
  E4: 329.63,
  F4: 349.23,
  G4: 392.0,
} as const;

type Pitch = keyof typeof F;

// [pitch, length in beats]
const ODE_PHRASES: [Pitch, number][][] = [
  // A: E E F G | G F E D | C C D E | E. D D—
  [['E4', 1], ['E4', 1], ['F4', 1], ['G4', 1], ['G4', 1], ['F4', 1], ['E4', 1], ['D4', 1],
   ['C4', 1], ['C4', 1], ['D4', 1], ['E4', 1], ['E4', 1.5], ['D4', 0.5], ['D4', 2]],
  // A': E E F G | G F E D | C C D E | D. C C—
  [['E4', 1], ['E4', 1], ['F4', 1], ['G4', 1], ['G4', 1], ['F4', 1], ['E4', 1], ['D4', 1],
   ['C4', 1], ['C4', 1], ['D4', 1], ['E4', 1], ['D4', 1.5], ['C4', 0.5], ['C4', 2]],
  // B: D D E C | D E F E C | D E F E D | C D G—
  [['D4', 1], ['D4', 1], ['E4', 1], ['C4', 1],
   ['D4', 1], ['E4', 0.5], ['F4', 0.5], ['E4', 1], ['C4', 1],
   ['D4', 1], ['E4', 0.5], ['F4', 0.5], ['E4', 1], ['D4', 1],
   ['C4', 1], ['D4', 1], ['G3', 2]],
  // A': E E F G | G F E D | C C D E | D. C C—
  [['E4', 1], ['E4', 1], ['F4', 1], ['G4', 1], ['G4', 1], ['F4', 1], ['E4', 1], ['D4', 1],
   ['C4', 1], ['C4', 1], ['D4', 1], ['E4', 1], ['D4', 1.5], ['C4', 0.5], ['C4', 2]],
];

// Lanes follow pitch so the chart "plays" the melody left (low) to right (high)
const LANE_FOR: Record<Pitch, 0 | 1 | 2 | 3> = {
  G3: 0,
  C4: 0,
  D4: 1,
  E4: 2,
  F4: 3,
  G4: 3,
};

const COUNT_IN_BEATS = 4;

function buildOdeToJoy(): { melody: MelodyNote[]; tiles: TileNote[]; endBeat: number } {
  const melody: MelodyNote[] = [];
  const tiles: TileNote[] = [];
  let beat = COUNT_IN_BEATS;
  let prevLane: number | null = null;

  ODE_PHRASES.flat().forEach(([pitch, length], i) => {
    let lane = LANE_FOR[pitch];
    // Repeated notes alternate between neighbouring lanes so a run of the
    // same pitch doesn't hammer a single column (classic rhythm-game charting)
    const prev = melody[melody.length - 1];
    if (prev && prev.noteName === pitch && prevLane === lane) {
      lane = (lane === 3 ? 2 : lane + 1) as 0 | 1 | 2 | 3;
    }

    // Half notes become hold tiles; everything shorter is a tap
    const isHold = length >= 2;
    melody.push({ beat, lane, frequency: F[pitch], durationBeats: isHold ? length : 0, noteName: pitch });
    tiles.push({
      id: `ode_note_${i + 1}`,
      lane,
      beat,
      durationBeats: isHold ? length - 0.5 : 0, // leave a small gap before the next note
    });
    prevLane = lane;
    beat += length;
  });

  return { melody, tiles, endBeat: beat };
}

const ode = buildOdeToJoy();
const ODE_BPM = 112;

export const ODE_TO_JOY: PresetSong = {
  beatsPerMeasure: 4,
  melody: ode.melody,
  song: {
    id: 'preset_ode_to_joy',
    title: 'Ode to Joy',
    artist: 'L. v. Beethoven',
    audioUri: 'synthesized:ode_to_joy',
    bpm: ODE_BPM,
    timeSignature: { beatsPerMeasure: 4, beatUnit: 4 },
    tiles: ode.tiles,
    createdAt: 1700000001000,
    // Song end + one bar of tail so the last hold can finish
    durationSeconds: Math.ceil(((ode.endBeat + 2) * 60) / ODE_BPM),
  },
};

export const FUR_ELISE: PresetSong = {
  beatsPerMeasure: 4,
  melody: STARTER_MELODY,
  song: STARTER_SONG,
};

/** All presets, in the order they appear for new players. */
export const PRESET_SONGS: PresetSong[] = [FUR_ELISE, ODE_TO_JOY];

/** Melody lookup for the synthesizer, keyed by the song's `synthesized:` URI. */
export function getPresetByAudioUri(audioUri: string): PresetSong | undefined {
  return PRESET_SONGS.find((p) => p.song.audioUri === audioUri);
}

export const PRESET_IDS = new Set(PRESET_SONGS.map((p) => p.song.id));
