import { HitJudgment } from '../types/game';
import { TileNote, SlidePoint } from '../types/song';

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

/* ------------------------------------------------------------------------ *
 * Slide tiles — holds that travel across lanes along a path of bends.
 * ------------------------------------------------------------------------ */

/** Smallest gap allowed between two bends of a slide (beats). */
export const MIN_SLIDE_SEGMENT_BEATS = 1 / 16;

/** True when the tile is a slide (a hold with a path of 2+ points). */
export function isSlideTile(tile: Pick<TileNote, 'durationBeats' | 'path'>): boolean {
  return tile.durationBeats > 0 && !!tile.path && tile.path.length >= 2;
}

/**
 * Cleans up a slide path so the game can trust it: sorted by time, starts at
 * t = 0, ends at t = durationBeats, lane positions kept inside the board, and
 * bends at least MIN_SLIDE_SEGMENT_BEATS apart. Two points may share the same
 * time: that's a sideways move (the slide runs straight across the lanes).
 */
export function normalizeSlidePath(path: SlidePoint[], durationBeats: number): SlidePoint[] {
  const clampX = (x: number) => Math.max(0, Math.min(3, Number.isFinite(x) ? x : 0));
  const sorted = path
    .map((p, i) => ({ t: Math.max(0, Math.min(durationBeats, p.t)), x: clampX(p.x), i }))
    .filter((p) => Number.isFinite(p.t))
    .sort((a, b) => a.t - b.t || a.i - b.i) // stable: keeps the order of sideways pairs
    .map(({ t, x }) => ({ t, x }));
  if (sorted.length === 0 || durationBeats <= 0) return [];
  const out: SlidePoint[] = [{ t: 0, x: sorted[0].x }];
  for (const p of sorted.slice(1)) {
    const last = out[out.length - 1];
    if (Math.abs(p.t - last.t) < 1e-9) {
      if (p.x === last.x) continue;
      // At most two points per moment (start and end of the sideways move)
      if (out.length >= 2 && Math.abs(out[out.length - 2].t - p.t) < 1e-9) last.x = p.x;
      else out.push({ t: last.t, x: p.x });
      continue;
    }
    if (p.t - last.t < MIN_SLIDE_SEGMENT_BEATS - 1e-9) continue;
    out.push(p);
  }
  const last = out[out.length - 1];
  if (last.t < durationBeats - 1e-9) out.push({ t: durationBeats, x: last.x });
  return out.length >= 2 ? out : [out[0], { t: durationBeats, x: out[0].x }];
}

/**
 * Lane position (left edge, in lanes) of a slide at `beat` beats after its
 * start. Runs on the UI thread too, to move the "follow me" marker.
 */
export function slideXAt(path: SlidePoint[], beat: number): number {
  'worklet';
  if (path.length === 0) return 0;
  if (beat <= path[0].t) return path[0].x;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    if (beat <= b.t) {
      const span = b.t - a.t;
      return span <= 0 ? b.x : a.x + ((beat - a.t) / span) * (b.x - a.x);
    }
  }
  return path[path.length - 1].x;
}

/**
 * Whether a finger at `fingerX` (lane units, 0 = left edge of the board,
 * 4 = right edge) is on a slide whose left edge is at `slideX`. A little
 * slack either side keeps it forgiving on steep angles.
 */
export function isFingerOnSlide(fingerX: number, slideX: number, slack: number = 0.35): boolean {
  return fingerX >= slideX - slack && fingerX <= slideX + 1 + slack;
}

/** Editor positions slides in half-lane steps (0, 0.5, 1 … 3). */
export const SLIDE_X_STEP = 0.5;
/** Most bends one slide can have. */
export const MAX_SLIDE_POINTS = 32;

export const snapSlideX = (x: number) =>
  Math.max(0, Math.min(3, Math.round(x / SLIDE_X_STEP) * SLIDE_X_STEP));

/** A new slide placed in the editor: starts in `lane` and leans one lane over. */
export function defaultSlidePath(lane: number, durationBeats: number): SlidePoint[] {
  return [
    { t: 0, x: lane },
    { t: durationBeats, x: lane < 3 ? lane + 1 : lane - 1 },
  ];
}

/**
 * Leftmost and rightmost lane position the slide covers between `t0` and
 * `t1` beats (includes sideways moves inside that window).
 */
export function slideRange(path: SlidePoint[], t0: number, t1: number): { min: number; max: number } {
  let min = Math.min(slideXAt(path, t0), slideXAt(path, t1));
  let max = Math.max(slideXAt(path, t0), slideXAt(path, t1));
  for (const p of path) {
    if (p.t >= t0 - 1e-9 && p.t <= t1 + 1e-9) {
      min = Math.min(min, p.x);
      max = Math.max(max, p.x);
    }
  }
  return { min, max };
}

/** One horizontal band of a slide drawing (lanes for x, px for y from the tile's top). */
export interface SlideStrip {
  top: number;
  height: number;
  /** Left edge of the band (lanes). */
  left: number;
  /** Right edge of the band (lanes); left + 1 unless the slide moves sideways here. */
  right: number;
  /** Where the path runs inside this band (lanes, centre line). */
  railFrom: number;
  railTo: number;
}

/**
 * Bands that draw a slide as pixel-art steps: one every `step` px from the
 * start (bottom) to the end (top). Each band covers everything the slide
 * touches in that slice, so steep and sideways parts stay connected.
 * Returned bottom-up.
 */
export function slideStrips(
  path: SlidePoint[],
  durationBeats: number,
  pixelsPerBeat: number,
  step: number
): SlideStrip[] {
  const total = durationBeats * pixelsPerBeat;
  const out: SlideStrip[] = [];
  for (let y = 0; y < total - 1e-6; y += step) {
    const h = Math.min(step, total - y);
    const { min, max } = slideRange(path, y / pixelsPerBeat, (y + h) / pixelsPerBeat);
    out.push({ top: total - y - h, height: h, left: min, right: max + 1, railFrom: min + 0.5, railTo: max + 0.5 });
  }
  return out;
}

/** A horizontal piece of a slide's outline (lanes for x, px for y). */
export interface SlideEdge {
  y: number;
  from: number;
  to: number;
  side: 'top' | 'bottom';
}

/** Parts of [a, b] not covered by [c, d]. */
function uncovered(a: number, b: number, c: number, d: number): [number, number][] {
  if (d <= a || c >= b) return [[a, b]];
  const out: [number, number][] = [];
  if (c > a) out.push([a, c]);
  if (d < b) out.push([d, b]);
  return out;
}

/**
 * The horizontal parts of the slide's outline: wherever a band's top or
 * bottom isn't covered by the next band, so the border runs continuously
 * around every step instead of each band drawing its own box.
 */
export function slideOutline(strips: SlideStrip[]): SlideEdge[] {
  const edges: SlideEdge[] = [];
  strips.forEach((s, i) => {
    const above = strips[i + 1];
    const below = strips[i - 1];
    const tops = above ? uncovered(s.left, s.right, above.left, above.right) : [[s.left, s.right] as [number, number]];
    const bottoms = below ? uncovered(s.left, s.right, below.left, below.right) : [[s.left, s.right] as [number, number]];
    for (const [from, to] of tops) if (to - from > 1e-6) edges.push({ y: s.top, from, to, side: 'top' });
    for (const [from, to] of bottoms) if (to - from > 1e-6) edges.push({ y: s.top + s.height, from, to, side: 'bottom' });
  });
  return edges;
}
