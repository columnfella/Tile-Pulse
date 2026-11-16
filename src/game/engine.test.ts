import test from 'node:test';
import assert from 'node:assert/strict';
import { slideStrips, slideOutline } from './engine';
import {
  calculateNoteTimeSeconds,
  calculateTileY,
  calculateTileHeight,
  evaluateHitJudgment,
  isWithinHitWindow,
  isTilePastMissThreshold,
  calculateHoldProgress,
  snapToGrid,
  getMeasureInfo,
  calculateOverallAccuracy,
  isSlideTile,
  normalizeSlidePath,
  slideXAt,
  isFingerOnSlide,
} from './engine';

test('calculateNoteTimeSeconds maps musical beat to audio seconds accurately', () => {
  // At 120 BPM, 1 beat = 0.5s
  assert.equal(calculateNoteTimeSeconds(0, 120), 0);
  assert.equal(calculateNoteTimeSeconds(1, 120), 0.5);
  assert.equal(calculateNoteTimeSeconds(2, 120), 1.0);
  assert.equal(calculateNoteTimeSeconds(4, 120), 2.0);

  // At 60 BPM, 1 beat = 1.0s
  assert.equal(calculateNoteTimeSeconds(3, 60), 3.0);
});

test('calculateTileY audio-synced formula aligns exactly at hitLine when noteTime == currentAudioTime', () => {
  const bpm = 120;
  const pixelsPerBeat = 200;
  const hitLineY = 600;

  // When current audio time equals note time, TileY should be exactly hitLineY
  const noteTime = 2.0; // beat 4
  const currentAudioTime = 2.0;
  const yAtHit = calculateTileY(noteTime, currentAudioTime, pixelsPerBeat, bpm, hitLineY);
  assert.equal(yAtHit, hitLineY);

  // When note is 1 beat in the future (0.5s away at 120 BPM)
  const currentBefore = 1.5;
  const yBefore = calculateTileY(noteTime, currentBefore, pixelsPerBeat, bpm, hitLineY);
  // delta = 0.5s * 200 * (120/60) = 0.5 * 200 * 2 = 200px
  // yBefore = 600 - 200 = 400px (higher up the screen)
  assert.equal(yBefore, 400);

  // When note is 1 beat in the past (0.5s past hit line)
  const currentAfter = 2.5;
  const yAfter = calculateTileY(noteTime, currentAfter, pixelsPerBeat, bpm, hitLineY);
  // delta = -0.5s * 200 * 2 = -200px
  // yAfter = 600 - (-200) = 800px (past the hit line)
  assert.equal(yAfter, 800);
});

test('calculateTileHeight distinguishes tap tiles from stretched hold tiles', () => {
  const pixelsPerBeat = 200;
  const defaultHeight = 100;

  // Tap tile: durationBeats 0 -> defaultTapHeight
  assert.equal(calculateTileHeight(0, pixelsPerBeat, defaultHeight), defaultHeight);

  // Hold tile: durationBeats 2 -> 2 * 200 = 400
  assert.equal(calculateTileHeight(2, pixelsPerBeat, defaultHeight), 400);

  // Tiny hold tile: durationBeats 0.2 -> 0.2 * 200 = 40, clamped to defaultHeight
  assert.equal(calculateTileHeight(0.2, pixelsPerBeat, defaultHeight), defaultHeight);
});

test('evaluateHitJudgment provides calibrated rhythm windows', () => {
  // Perfect window (<= 55ms)
  const perfect = evaluateHitJudgment(0.03);
  assert.equal(perfect.judgment, 'PERFECT');
  assert.equal(perfect.score, 1000);

  // Great window (<= 110ms)
  const great = evaluateHitJudgment(-0.08);
  assert.equal(great.judgment, 'GREAT');
  assert.equal(great.score, 750);

  // Good window (<= 170ms)
  const good = evaluateHitJudgment(0.14);
  assert.equal(good.judgment, 'GOOD');
  assert.equal(good.score, 400);

  // Miss (> 170ms)
  const miss = evaluateHitJudgment(0.25);
  assert.equal(miss.judgment, 'MISS');
  assert.equal(miss.score, 0);
});

test('isWithinHitWindow validates actionable range', () => {
  assert.equal(isWithinHitWindow(0.05), true);
  assert.equal(isWithinHitWindow(0.16), true);
  assert.equal(isWithinHitWindow(0.25), false);
});

test('isTilePastMissThreshold detects notes that left the hit zone without tap', () => {
  const noteTime = 2.0;
  const bpm = 120;

  // Before note time
  assert.equal(isTilePastMissThreshold(noteTime, 1.9, 0, bpm), false);
  // Slightly past note time but within grace window
  assert.equal(isTilePastMissThreshold(noteTime, 2.1, 0, bpm), false);
  // Past miss threshold (> 190ms)
  assert.equal(isTilePastMissThreshold(noteTime, 2.3, 0, bpm), true);
});

test('calculateHoldProgress tracks progress smoothly from 0 to 1', () => {
  const start = 2.0;
  const duration = 1.0;

  // Before start
  assert.equal(calculateHoldProgress(1.5, start, duration), 0);
  // Halfway
  assert.equal(calculateHoldProgress(2.5, start, duration), 0.5);
  // Complete
  assert.equal(calculateHoldProgress(3.0, start, duration), 1.0);
  // Past duration
  assert.equal(calculateHoldProgress(3.5, start, duration), 1.0);
});

test('snapToGrid snaps beats to musical subdivisions', () => {
  assert.equal(snapToGrid(1.23, 0.5), 1.0);
  assert.equal(snapToGrid(1.27, 0.5), 1.5);
  assert.equal(snapToGrid(1.15, 0.25), 1.25);
});

test('getMeasureInfo calculates measure numbers and barlines in 4/4 time', () => {
  const m1 = getMeasureInfo(0, 4);
  assert.equal(m1.measure, 1);
  assert.equal(m1.isBarline, true);

  const m1Beat3 = getMeasureInfo(2, 4);
  assert.equal(m1Beat3.measure, 1);
  assert.equal(m1Beat3.isBarline, false);

  const m2 = getMeasureInfo(4, 4);
  assert.equal(m2.measure, 2);
  assert.equal(m2.isBarline, true);
});

test('calculateOverallAccuracy computes weighted percentage correctly', () => {
  const stats = {
    perfectCount: 8,
    greatCount: 2,
    goodCount: 0,
    missCount: 0,
    totalNotes: 10,
  };
  // (8 * 1.0 + 2 * 0.75) / 10 = 9.5 / 10 = 95.0%
  assert.equal(calculateOverallAccuracy(stats), 95);
});

test('isSlideTile needs a hold with a 2+ point path', () => {
  assert.equal(isSlideTile({ durationBeats: 2, path: [{ t: 0, x: 0 }, { t: 2, x: 3 }] }), true);
  assert.equal(isSlideTile({ durationBeats: 0, path: [{ t: 0, x: 0 }, { t: 2, x: 3 }] }), false);
  assert.equal(isSlideTile({ durationBeats: 2, path: [{ t: 0, x: 0 }] }), false);
  assert.equal(isSlideTile({ durationBeats: 2 }), false);
});

test('normalizeSlidePath sorts, clamps, and pins the ends', () => {
  const out = normalizeSlidePath([{ t: 1.5, x: 9 }, { t: 0.2, x: -1 }, { t: 0.5, x: 2 }], 2);
  assert.deepEqual(out, [
    { t: 0, x: 0 },
    { t: 0.5, x: 2 },
    { t: 1.5, x: 3 },
    { t: 2, x: 3 },
  ]);
});

test('slideXAt interpolates along every bend', () => {
  const path = [{ t: 0, x: 0 }, { t: 1, x: 2 }, { t: 2, x: 1 }];
  assert.equal(slideXAt(path, -1), 0);
  assert.equal(slideXAt(path, 0.5), 1);
  assert.equal(slideXAt(path, 1), 2);
  assert.equal(slideXAt(path, 1.5), 1.5);
  assert.equal(slideXAt(path, 5), 1);
});

test('isFingerOnSlide allows a little slack around the tile', () => {
  assert.equal(isFingerOnSlide(1.5, 1), true);
  assert.equal(isFingerOnSlide(2.3, 1), true);
  assert.equal(isFingerOnSlide(2.5, 1), false);
  assert.equal(isFingerOnSlide(0.6, 1), false);
});

test('normalizeSlidePath keeps sideways moves (two points at the same beat)', () => {
  const out = normalizeSlidePath([{ t: 0, x: 0 }, { t: 1, x: 0 }, { t: 1, x: 3 }, { t: 1, x: 2 }, { t: 2, x: 2 }], 2);
  // A third point at the same beat replaces the end of the sideways move
  assert.deepEqual(out, [{ t: 0, x: 0 }, { t: 1, x: 0 }, { t: 1, x: 2 }, { t: 2, x: 2 }]);
});

test('slideStrips widen to cover a sideways move, and the outline is continuous', () => {
  const path = [{ t: 0, x: 0 }, { t: 1, x: 0 }, { t: 1, x: 2 }, { t: 2, x: 2 }];
  const strips = slideStrips(path, 2, 8, 4); // 16px tall, 4 bands
  assert.equal(strips.length, 4);
  assert.deepEqual([strips[0].left, strips[0].right], [0, 1]); // bottom: lane 1
  assert.deepEqual([strips[1].left, strips[1].right], [0, 3]); // band at the sideways move spans lanes 1–3
  assert.deepEqual([strips[3].left, strips[3].right], [2, 3]); // top: lane 3
  const edges = slideOutline(strips);
  // The wide band's exposed bottom (lanes 2–3) and top (lanes 1–2) get border pieces
  assert.ok(edges.some((e) => e.side === 'bottom' && e.from === 1 && e.to === 3));
  assert.ok(edges.some((e) => e.side === 'top' && e.from === 0 && e.to === 2));
});
