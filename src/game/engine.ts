import { HitJudgment } from '../types/game';
import { TileNote } from '../types/song';

/**
 * Pure Game Engine Math and Timing Logic
 * Fully decoupled from UI rendering for 60/120fps predictability and unit testability.
 */

/**
 * Converts a musical beat position to exact audio time in seconds.
 * Formula: NoteTimeSeconds = tile.beat * (60 / song.bpm)
 */
export function calculateNoteTimeSeconds(beat: number, bpm: number): number {
  if (bpm <= 0) return 0;
  return beat * (60 / bpm);
}

/**
 * Audio-Synced Game Loop Y-Position Formula
 * Directly drives tile Y-positions from current audio playback time.
 * 
 * Formula:
 * TileY = HitLineY - (NoteTimeSeconds - currentAudioTime) * PixelsPerBeat * (song.bpm / 60)
 */
export function calculateTileY(
  noteTimeSeconds: number,
  currentAudioTime: number,
  pixelsPerBeat: number,
  bpm: number,
  hitLineY: number
): number {
  const beatsPerSecond = bpm / 60;
  const timeDelta = noteTimeSeconds - currentAudioTime;
  return hitLineY - timeDelta * pixelsPerBeat * beatsPerSecond;
}

/**
 * Calculates visual tile height.
 * Tap tiles use fixed height; hold tiles stretch according to their beat duration.
 */
export function calculateTileHeight(
  durationBeats: number,
  pixelsPerBeat: number,
  defaultTapHeight: number
): number {
  if (durationBeats <= 0) {
    return defaultTapHeight;
  }
  return Math.max(defaultTapHeight, durationBeats * pixelsPerBeat);
}

/**
 * Timing judgment windows in seconds:
 * - PERFECT: within ±55ms
 * - GREAT: within ±110ms
 * - GOOD: within ±170ms
 * - MISS: outside window
 */
export const JUDGMENT_WINDOWS = {
  PERFECT_MS: 55,
  GREAT_MS: 110,
  GOOD_MS: 170,
};

export interface JudgmentResult {
  judgment: HitJudgment;
  score: number;
  accuracyWeight: number; // 1.0, 0.75, 0.4, 0.0
}

export function evaluateHitJudgment(timeDiffSeconds: number): JudgmentResult {
  const absDiffMs = Math.abs(timeDiffSeconds) * 1000;

  if (absDiffMs <= JUDGMENT_WINDOWS.PERFECT_MS) {
    return { judgment: 'PERFECT', score: 1000, accuracyWeight: 1.0 };
  } else if (absDiffMs <= JUDGMENT_WINDOWS.GREAT_MS) {
    return { judgment: 'GREAT', score: 750, accuracyWeight: 0.75 };
  } else if (absDiffMs <= JUDGMENT_WINDOWS.GOOD_MS) {
    return { judgment: 'GOOD', score: 400, accuracyWeight: 0.4 };
  } else {
    return { judgment: 'MISS', score: 0, accuracyWeight: 0.0 };
  }
}

/**
 * Check if a tap event occurs within the actionable hit window
 */
export function isWithinHitWindow(timeDiffSeconds: number): boolean {
  return Math.abs(timeDiffSeconds) * 1000 <= JUDGMENT_WINDOWS.GOOD_MS;
}

/**
 * Determines whether a tile has traveled past the hit line and is considered missed
 */
export function isTilePastMissThreshold(
  noteTimeSeconds: number,
  currentAudioTime: number,
  durationBeats: number,
  bpm: number
): boolean {
  const durationSeconds = durationBeats > 0 ? (durationBeats * 60) / bpm : 0;
  const noteEndTime = noteTimeSeconds + durationSeconds;
  const missDelaySeconds = (JUDGMENT_WINDOWS.GOOD_MS + 20) / 1000;
  return currentAudioTime > noteEndTime + missDelaySeconds;
}

/**
 * Calculates hold progress (0 to 1) given the note's start time and total duration
 */
export function calculateHoldProgress(
  currentAudioTime: number,
  startNoteTime: number,
  durationSeconds: number
): number {
  if (durationSeconds <= 0) return 1;
  const elapsed = currentAudioTime - startNoteTime;
  if (elapsed <= 0) return 0;
  return Math.min(1, Math.max(0, elapsed / durationSeconds));
}

/**
 * Musical beat grid snap helper for the editor (e.g. 0.25, 0.5, 1.0 beats)
 */
export function snapToGrid(beat: number, subdivision: number = 0.5): number {
  if (subdivision <= 0) return beat;
  return Math.round(beat / subdivision) * subdivision;
}

/**
 * Measure calculation for musical notation and barlines in the editor
 */
export function getMeasureInfo(beat: number, beatsPerMeasure: number = 4) {
  const measure = Math.floor(beat / beatsPerMeasure) + 1;
  const beatInMeasure = (beat % beatsPerMeasure) + 1;
  const isBarline = Math.abs(beat % beatsPerMeasure) < 0.001;
  return { measure, beatInMeasure, isBarline };
}

/**
 * Computes overall percentage accuracy from judgment counts
 */
export function calculateOverallAccuracy(stats: {
  perfectCount: number;
  greatCount: number;
  goodCount: number;
  missCount: number;
  totalNotes: number;
}): number {
  const { perfectCount, greatCount, goodCount, totalNotes } = stats;
  if (totalNotes <= 0) return 100;
  const weighted = perfectCount * 1.0 + greatCount * 0.75 + goodCount * 0.4;
  return Math.round((weighted / totalNotes) * 1000) / 10;
}

/**
 * Formats time in mm:ss or mm:ss.ms
 */
export function formatAudioTime(seconds: number, includeMs: boolean = false): string {
  const safeSec = Math.max(0, isNaN(seconds) ? 0 : seconds);
  const mins = Math.floor(safeSec / 60);
  const secs = Math.floor(safeSec % 60);
  const paddedSecs = secs < 10 ? `0${secs}` : `${secs}`;

  if (includeMs) {
    const ms = Math.floor((safeSec % 1) * 100);
    const paddedMs = ms < 10 ? `0${ms}` : `${ms}`;
    return `${mins}:${paddedSecs}.${paddedMs}`;
  }
  return `${mins}:${paddedSecs}`;
}
