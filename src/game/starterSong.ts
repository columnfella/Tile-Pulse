import { Song, TileNote } from '../types/song';

/**
 * Starter sample song: "Für Elise - Neon Piano Edition"
 * Pre-configured with 120 BPM, 4/4 time signature, and authentic note placements
 * across all 4 lanes with both normal tap tiles and hold tiles.
 */

// Musical notes for the melody (for the built-in acoustic piano synthesizer)
export interface MelodyNote {
  beat: number;
  lane: 0 | 1 | 2 | 3;
  frequency: number; // Hz
  durationBeats: number;
  noteName: string;
}

// Piano frequencies
export const P_FREQS = {
  A3: 220.0,
  C4: 261.63,
  D4: 293.66,
  E4: 329.63,
  G4: 392.0,
  A4: 440.0,
  B4: 493.88,
  C5: 523.25,
  D5: 587.33,
  Ds5: 622.25,
  E5: 659.25,
};

export const STARTER_MELODY: MelodyNote[] = [
  // Measure 1 - Iconic opening theme
  { beat: 2.0, lane: 3, frequency: P_FREQS.E5, durationBeats: 0, noteName: 'E5' },
  { beat: 2.5, lane: 2, frequency: P_FREQS.Ds5, durationBeats: 0, noteName: 'D#5' },
  { beat: 3.0, lane: 3, frequency: P_FREQS.E5, durationBeats: 0, noteName: 'E5' },
  { beat: 3.5, lane: 2, frequency: P_FREQS.Ds5, durationBeats: 0, noteName: 'D#5' },
  
  // Measure 2
  { beat: 4.0, lane: 3, frequency: P_FREQS.E5, durationBeats: 0, noteName: 'E5' },
  { beat: 4.5, lane: 1, frequency: P_FREQS.B4, durationBeats: 0, noteName: 'B4' },
  { beat: 5.0, lane: 2, frequency: P_FREQS.D5, durationBeats: 0, noteName: 'D5' },
  { beat: 5.5, lane: 1, frequency: P_FREQS.C5, durationBeats: 0, noteName: 'C5' },
  
  // Measure 3 - Hold note resolution
  { beat: 6.0, lane: 0, frequency: P_FREQS.A4, durationBeats: 1.5, noteName: 'A4 (Hold)' },
  
  // Measure 4 - Arpeggiated bass / left hand run
  { beat: 8.0, lane: 0, frequency: P_FREQS.A3, durationBeats: 0, noteName: 'A3' },
  { beat: 8.5, lane: 1, frequency: P_FREQS.C4, durationBeats: 0, noteName: 'C4' },
  { beat: 9.0, lane: 2, frequency: P_FREQS.E4, durationBeats: 0, noteName: 'E4' },
  { beat: 9.5, lane: 3, frequency: P_FREQS.A4, durationBeats: 0, noteName: 'A4' },
  
  // Measure 5 - Right hand response
  { beat: 10.0, lane: 1, frequency: P_FREQS.B4, durationBeats: 1.0, noteName: 'B4 (Hold)' },
  { beat: 11.5, lane: 2, frequency: P_FREQS.C5, durationBeats: 0, noteName: 'C5' },
  
  // Measure 6
  { beat: 12.0, lane: 2, frequency: P_FREQS.D5, durationBeats: 0, noteName: 'D5' },
  { beat: 12.5, lane: 3, frequency: P_FREQS.E5, durationBeats: 0, noteName: 'E5' },
  { beat: 13.0, lane: 1, frequency: P_FREQS.C5, durationBeats: 0, noteName: 'C5' },
  { beat: 13.5, lane: 1, frequency: P_FREQS.B4, durationBeats: 0, noteName: 'B4' },

  // Measure 7 - Big hold note finish
  { beat: 14.0, lane: 0, frequency: P_FREQS.A4, durationBeats: 2.0, noteName: 'A4 (Final Hold)' },
  
  // Measure 8 - Flourish
  { beat: 17.0, lane: 0, frequency: P_FREQS.C4, durationBeats: 0, noteName: 'C4' },
  { beat: 17.5, lane: 1, frequency: P_FREQS.E4, durationBeats: 0, noteName: 'E4' },
  { beat: 18.0, lane: 2, frequency: P_FREQS.G4, durationBeats: 0, noteName: 'G4' },
  { beat: 18.5, lane: 3, frequency: P_FREQS.C5, durationBeats: 1.5, noteName: 'C5 (Hold)' },

  // Measure 9 - Grand chord finale
  { beat: 21.0, lane: 0, frequency: P_FREQS.A3, durationBeats: 0, noteName: 'A3' },
  { beat: 21.5, lane: 2, frequency: P_FREQS.E4, durationBeats: 0, noteName: 'E4' },
  { beat: 22.0, lane: 3, frequency: P_FREQS.A4, durationBeats: 2.0, noteName: 'A4 (Climax Hold)' },
];

export const STARTER_TILES: TileNote[] = STARTER_MELODY.map((m, idx) => ({
  id: `starter_note_${idx + 1}`,
  lane: m.lane,
  beat: m.beat,
  durationBeats: m.durationBeats,
}));

export const STARTER_SONG: Song = {
  id: 'starter_fur_elise',
  title: 'Für Elise (Neon Classical)',
  artist: 'L. v. Beethoven',
  audioUri: 'synthesized:fur_elise',
  bpm: 120,
  timeSignature: {
    beatsPerMeasure: 4,
    beatUnit: 4,
  },
  tiles: STARTER_TILES,
  createdAt: 1700000000000,
  durationSeconds: 14, // ~26 beats at 120 BPM = 13-14 seconds
};
