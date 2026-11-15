/**
 * Offline PCM synthesizer.
 *
 * React Native has no Web Audio API, so instead of scheduling oscillators in
 * real time we render sounds into 16-bit mono WAV buffers once, write them to
 * a file (or Blob URL on web) and play them back through expo-audio.
 */

import { STARTER_MELODY } from '../game/starterSong';

export const SAMPLE_RATE = 22050;

type Wave = 'sine' | 'triangle';

function osc(type: Wave, phase: number): number {
  if (type === 'sine') return Math.sin(phase);
  // Triangle wave in [-1, 1]
  const t = (phase / (2 * Math.PI)) % 1;
  return 4 * Math.abs(t - 0.5) - 1;
}

/**
 * Adds a tone with a linear attack and exponential decay into `buf`.
 * Mirrors the gain envelopes of the original Web Audio implementation.
 */
function addTone(
  buf: Float32Array,
  startSec: number,
  freq: number,
  type: Wave,
  peak: number,
  attackSec: number,
  decaySec: number
): void {
  const start = Math.floor(startSec * SAMPLE_RATE);
  const length = Math.floor((attackSec + decaySec) * SAMPLE_RATE);
  const attack = Math.max(1, Math.floor(attackSec * SAMPLE_RATE));
  // Exponential decay from `peak` down to ~0.001 over decaySec
  const decayRate = Math.log(peak / 0.001) / Math.max(1, length - attack);
  const step = (2 * Math.PI * freq) / SAMPLE_RATE;

  for (let i = 0; i < length; i++) {
    const idx = start + i;
    if (idx < 0) continue;
    if (idx >= buf.length) break;
    const env = i < attack ? (peak * i) / attack : peak * Math.exp(-decayRate * (i - attack));
    buf[idx] += env * osc(type, step * i);
  }
}

/** Encodes float samples in [-1, 1] as a 16-bit mono PCM WAV file. */
export function encodeWav(samples: Float32Array): Uint8Array<ArrayBuffer> {
  const dataBytes = samples.length * 2;
  const out = new Uint8Array(44 + dataBytes);
  const view = new DataView(out.buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) out[offset + i] = s.charCodeAt(i);
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeStr(36, 'data');
  view.setUint32(40, dataBytes, true);

  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return out;
}



/** Renders the built-in starter song (melody + metronome) as a full track. */
export function renderStarterTrack(bpm: number, durationSeconds: number): Uint8Array<ArrayBuffer> {
  const buf = new Float32Array(Math.ceil((durationSeconds + 0.5) * SAMPLE_RATE));
  const secondsPerBeat = 60 / bpm;

  STARTER_MELODY.forEach((note) => {
    const duration = note.durationBeats > 0 ? note.durationBeats * secondsPerBeat : 0.35;
    addTone(buf, note.beat * secondsPerBeat, note.frequency, 'triangle', 0.4, 0.008, duration);
  });

  const totalBeats = Math.ceil(durationSeconds / secondsPerBeat);
  for (let b = 0; b <= totalBeats; b++) {
    const isMeasureStart = b % 4 === 0;
    addTone(
      buf,
      b * secondsPerBeat,
      isMeasureStart ? 880 : 440,
      'sine',
      isMeasureStart ? 0.1 : 0.04,
      0.002,
      0.035
    );
  }

  return encodeWav(buf);
}
