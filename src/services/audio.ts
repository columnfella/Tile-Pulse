/**
 * High-Performance Audio Engine for TilePulse
 * 
 * Provides:
 * 1. Exact sample-accurate currentTime tracking (using Web Audio API AudioContext)
 * 2. Uploaded audio playback (Blob/URL)
 * 3. Polyphonic acoustic piano synthesizer (with natural harmonics & decay)
 * 4. Crisp tactile hit feedback sound effects (synthesized with zero latency)
 * 5. Scrubbing and preview playback for the Beatmap Editor
 */

import { STARTER_MELODY, P_FREQS } from '../game/starterSong';

class AudioEngine {
  private ctx: AudioContext | null = null;
  private audioEl: HTMLAudioElement | null = null;
  private isSynthesized: boolean = false;
  private isPlaying: boolean = false;
  private startCtxTime: number = 0;
  private pauseOffsetTime: number = 0;
  private scheduledOscillators: { osc: OscillatorNode; gain: GainNode }[] = [];
  private currentSongId: string | null = null;
  private bpm: number = 120;
  private customDuration: number = 0;

  constructor() {
    // Lazy AudioContext initialization on first user interaction
  }

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  /**
   * Loads an audio track either from a blob/URL or as synthesized music
   */
  public async loadTrack(songId: string, audioUri: string, bpm: number, durationSeconds?: number): Promise<void> {
    this.stop();
    this.currentSongId = songId;
    this.bpm = bpm;
    this.pauseOffsetTime = 0;

    if (audioUri.startsWith('synthesized:')) {
      this.isSynthesized = true;
      this.customDuration = durationSeconds || 15;
      if (this.audioEl) {
        this.audioEl.pause();
        this.audioEl = null;
      }
    } else {
      this.isSynthesized = false;
      this.ensureContext();
      if (!this.audioEl) {
        this.audioEl = new Audio();
        this.audioEl.crossOrigin = 'anonymous';
      }
      this.audioEl.src = audioUri;
      await new Promise<void>((resolve) => {
        if (!this.audioEl) return resolve();
        this.audioEl.oncanplay = () => resolve();
        this.audioEl.onerror = () => resolve(); // fallback gracefully
        this.audioEl.load();
        setTimeout(resolve, 800); // safety fallback
      });
      this.customDuration = this.audioEl.duration || durationSeconds || 15;
    }
  }

  /**
   * Starts playback from an optional offset in seconds
   */
  public play(startOffsetSeconds: number = 0): void {
    const ctx = this.ensureContext();
    this.isPlaying = true;
    this.pauseOffsetTime = Math.max(0, startOffsetSeconds);
    this.startCtxTime = ctx.currentTime - this.pauseOffsetTime;

    if (this.isSynthesized) {
      this.scheduleSynthesizedPlayback(this.pauseOffsetTime);
    } else if (this.audioEl) {
      this.audioEl.currentTime = this.pauseOffsetTime;
      this.audioEl.play().catch((err) => {
        console.warn('Audio play prevented or interrupted:', err);
      });
    }
  }

  /**
   * Pauses playback while preserving current position
   */
  public pause(): void {
    if (!this.isPlaying) return;
    this.pauseOffsetTime = this.getCurrentTime();
    this.isPlaying = false;

    if (this.isSynthesized) {
      this.cancelScheduledSynth();
    } else if (this.audioEl) {
      this.audioEl.pause();
    }
  }

  /**
   * Stops playback and resets playhead to 0
   */
  public stop(): void {
    this.isPlaying = false;
    this.pauseOffsetTime = 0;
    if (this.isSynthesized) {
      this.cancelScheduledSynth();
    } else if (this.audioEl) {
      this.audioEl.pause();
      this.audioEl.currentTime = 0;
    }
  }

  /**
   * Seeks to a specific timestamp in seconds
   */
  public seek(seconds: number): void {
    const wasPlaying = this.isPlaying;
    if (wasPlaying) {
      this.pause();
    }
    this.pauseOffsetTime = Math.max(0, seconds);
    if (this.ctx) {
      this.startCtxTime = this.ctx.currentTime - this.pauseOffsetTime;
    }
    if (this.audioEl) {
      this.audioEl.currentTime = this.pauseOffsetTime;
    }
    if (wasPlaying) {
      this.play(this.pauseOffsetTime);
    }
  }

  /**
   * Exact audio playback time in seconds.
   * This is the master clock for the frame loop.
   */
  public getCurrentTime(): number {
    if (!this.isPlaying) {
      return this.pauseOffsetTime;
    }

    if (this.isSynthesized) {
      if (!this.ctx) return this.pauseOffsetTime;
      const elapsed = this.ctx.currentTime - this.startCtxTime;
      return Math.max(0, elapsed);
    } else if (this.audioEl) {
      return this.audioEl.currentTime;
    }

    if (!this.ctx) return 0;
    return Math.max(0, this.ctx.currentTime - this.startCtxTime);
  }

  public getDuration(): number {
    if (this.isSynthesized) {
      return this.customDuration || 15;
    }
    return this.audioEl?.duration || this.customDuration || 15;
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  /**
   * Plays low-latency procedural acoustic piano note or feedback chime
   */
  public playHitSound(lane: 0 | 1 | 2 | 3, isPerfect: boolean = true): void {
    try {
      const ctx = this.ensureContext();
      const now = ctx.currentTime;

      // Pentatonic pitch frequencies mapped across 4 lanes
      const laneFrequencies = [261.63, 329.63, 392.0, 523.25]; // C4, E4, G4, C5
      const baseFreq = laneFrequencies[lane] || 440;

      // Master note gain with quick attack and natural acoustic piano exponential decay
      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(isPerfect ? 0.28 : 0.18, now + 0.005);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + (isPerfect ? 0.35 : 0.2));

      // Fundamental oscillator
      const osc1 = ctx.createOscillator();
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(baseFreq, now);

      // 2nd harmonic oscillator (gives piano brightness)
      const osc2 = ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(baseFreq * 2, now);

      const harmonicGain = ctx.createGain();
      harmonicGain.gain.setValueAtTime(0.12, now);
      harmonicGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      osc1.connect(gainNode);
      osc2.connect(harmonicGain);
      harmonicGain.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.38);
      osc2.stop(now + 0.38);
    } catch {
      // AudioContext unavailable or blocked
    }
  }

  /**
   * Continuous hold note loop tick sound
   */
  public playHoldTick(progress: number): void {
    try {
      const ctx = this.ensureContext();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(520 + progress * 300, now);
      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.06);
    } catch {
      // Ignore
    }
  }

  /**
   * Schedules melody notes for synthesized tracks (e.g. starter song)
   */
  private scheduleSynthesizedPlayback(offsetSeconds: number): void {
    const ctx = this.ensureContext();
    const now = ctx.currentTime;
    this.cancelScheduledSynth();

    const secondsPerBeat = 60 / this.bpm;

    STARTER_MELODY.forEach((note) => {
      const noteTime = note.beat * secondsPerBeat;
      const scheduledTime = now + (noteTime - offsetSeconds);

      if (scheduledTime >= now - 0.05) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        // Rich piano-like timbre
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(note.frequency, Math.max(now, scheduledTime));

        const duration = note.durationBeats > 0 
          ? note.durationBeats * secondsPerBeat 
          : 0.35;

        const startTime = Math.max(now, scheduledTime);
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.24, startTime + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + duration + 0.05);

        this.scheduledOscillators.push({ osc, gain });
      }
    });

    // Also schedule subtle metronome/percussion accents for beat timing
    const totalBeats = Math.ceil(this.customDuration / secondsPerBeat);
    for (let b = 0; b <= totalBeats; b++) {
      const beatTime = b * secondsPerBeat;
      const schedTime = now + (beatTime - offsetSeconds);
      if (schedTime >= now - 0.05) {
        const isMeasureStart = b % 4 === 0;
        const tickOsc = ctx.createOscillator();
        const tickGain = ctx.createGain();
        tickOsc.type = 'sine';
        tickOsc.frequency.setValueAtTime(isMeasureStart ? 880 : 440, Math.max(now, schedTime));
        
        const startTime = Math.max(now, schedTime);
        tickGain.gain.setValueAtTime(0, startTime);
        tickGain.gain.linearRampToValueAtTime(isMeasureStart ? 0.06 : 0.02, startTime + 0.002);
        tickGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.035);

        tickOsc.connect(tickGain);
        tickGain.connect(ctx.destination);
        tickOsc.start(startTime);
        tickOsc.stop(startTime + 0.04);

        this.scheduledOscillators.push({ osc: tickOsc, gain: tickGain });
      }
    }
  }

  private cancelScheduledSynth(): void {
    this.scheduledOscillators.forEach(({ osc, gain }) => {
      try {
        osc.stop();
        osc.disconnect();
        gain.disconnect();
      } catch {
        // Already stopped
      }
    });
    this.scheduledOscillators = [];
  }
}

export const audioService = new AudioEngine();
