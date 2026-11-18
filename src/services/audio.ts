/**
 * Audio engine for TilePulse, built on expo-audio (iOS, Android and web).
 *
 * PERFORMANCE: on Android, reading expo-audio properties such as
 * `player.currentTime`, `player.playing` or `player.isLoaded` blocks the JS
 * thread until the Android main thread answers (runBlocking on the main
 * queue). Doing that every frame starves both threads and makes gameplay
 * stutter badly. So the hot path never touches native properties:
 *
 *  - The song clock is pure JavaScript: an anchor (position + wall-clock time)
 *    that is extrapolated with Date.now().
 *  - The anchor is set when playback starts and corrected from the player's
 *    `playbackStatusUpdate` events, which arrive asynchronously (no blocking).
 *  - Clock changes are broadcast to subscribers so the game can drive tile
 *    motion on the UI thread (see subscribeClock).
 */

import { createAudioPlayer, setAudioModeAsync, type AudioPlayer, type AudioStatus } from 'expo-audio';
import { renderPresetTrack } from '../audio/synth';
import { FUR_ELISE, getPresetByAudioUri } from '../game/presets';
import { writeGeneratedWav } from './audioFileStore';

const LOAD_TIMEOUT_MS = 5000;
const STATUS_INTERVAL_MS = 200;
/** Typical delay between the player's position and its status event arriving. */
const STATUS_LATENCY_SEC = 0.03;
/** Differences smaller than this are ignored (normal reporting jitter). */
const DRIFT_DEADZONE_SEC = 0.04;
/** Fraction of the remaining drift corrected per status event (smooth slew). */
const DRIFT_SLEW = 0.15;
/** Above this the clock snaps (seek, stall, audio glitch). */
const HARD_RESYNC_SEC = 0.35;
/** Largest single correction (8ms ≈ a few pixels), so slewing is never visible. */
const MAX_SLEW_STEP_SEC = 0.008;
const START_TIMEOUT_MS = 1200;

/** Song clock anchor: at wall time `wallMs` the song was at `pos` seconds. */
export interface ClockAnchor {
  pos: number;
  wallMs: number;
  running: boolean;
  duration: number;
}

type ClockListener = (anchor: ClockAnchor) => void;

class AudioEngine {
  private track: AudioPlayer | null = null;
  private trackSubscription: { remove: () => void } | null = null;
  private synthesizedUris = new Map<string, string>();
  private clockListeners = new Set<ClockListener>();

  private isPlaying = false;
  private duration = 15;
  private pausedAt = 0;
  // Clock anchor (see ClockAnchor)
  private anchorPos = 0;
  private anchorWallMs = 0;
  private clockRunning = false;
  private startTimer: ReturnType<typeof setTimeout> | null = null;
  private loadToken = 0;
  private trackLoaded = false;
  private currentSource: string | null = null;

  constructor() {
    setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' }).catch(
      (err) => console.warn('Failed to set audio mode:', err)
    );
  }

  /* ------------------------------ clock ------------------------------ */

  /** Subscribe to clock anchor changes. Returns an unsubscribe function. */
  public subscribeClock(listener: ClockListener): () => void {
    this.clockListeners.add(listener);
    listener(this.getClockAnchor());
    return () => {
      this.clockListeners.delete(listener);
    };
  }

  public getClockAnchor(): ClockAnchor {
    if (!this.isPlaying) {
      return { pos: this.pausedAt, wallMs: Date.now(), running: false, duration: this.duration };
    }
    return {
      pos: this.anchorPos,
      wallMs: this.anchorWallMs,
      running: this.clockRunning,
      duration: this.duration,
    };
  }

  private emitClock(): void {
    const anchor = this.getClockAnchor();
    this.clockListeners.forEach((l) => l(anchor));
  }

  private setAnchor(pos: number, running: boolean): void {
    this.anchorPos = pos;
    this.anchorWallMs = Date.now();
    this.clockRunning = running;
    this.emitClock();
  }

  private clearStartTimer(): void {
    if (this.startTimer) {
      clearTimeout(this.startTimer);
      this.startTimer = null;
    }
  }

  /** Handles async status events from the music player (never blocks JS). */
  private handleStatus = (status: AudioStatus): void => {
    if (status.isLoaded) this.trackLoaded = true;
    if (status.duration > 0) this.duration = status.duration;

    if (status.didJustFinish) {
      this.clearStartTimer();
      this.pausedAt = this.getCurrentTime();
      this.isPlaying = false;
      this.clockRunning = false;
      this.emitClock();
      return;
    }
    if (!this.isPlaying) return;

    const reported = status.currentTime;
    if (!this.clockRunning) {
      // Start the clock once audio output has really begun, so tiles don't
      // run ahead during player start-up latency. Positions outside
      // [offset, offset + 0.5s] are stale (seek still pending).
      if (status.playing && reported > this.anchorPos + 0.001 && reported < this.anchorPos + 0.5) {
        this.clearStartTimer();
        this.setAnchor(reported, true);
      }
      return;
    }

    if (!status.playing) return;

    // Status events arrive a little late, so `reported` lags the true
    // position by a few tens of ms. Snapping the clock to it made tiles jerk
    // back and forth. Instead:
    //  - big differences (seek, stall, audio glitch) snap immediately,
    //  - small drift is eased out gradually, which is invisible on screen.
    const error = reported + STATUS_LATENCY_SEC - this.getCurrentTime();
    if (Math.abs(error) > HARD_RESYNC_SEC) {
      this.setAnchor(reported, true);
    } else if (Math.abs(error) > DRIFT_DEADZONE_SEC) {
      const step = Math.max(-MAX_SLEW_STEP_SEC, Math.min(MAX_SLEW_STEP_SEC, error * DRIFT_SLEW));
      this.setAnchor(this.getCurrentTime() + step, true);
    }
  };

  /** Current playback position in seconds. Pure JS — safe to call every frame. */
  public getCurrentTime(): number {
    if (!this.isPlaying) return this.pausedAt;
    if (!this.clockRunning) return this.anchorPos;
    return Math.min(this.duration, this.anchorPos + (Date.now() - this.anchorWallMs) / 1000);
  }

  public getDuration(): number {
    return this.duration;
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  /* ------------------------------ transport --------------------------- */

  private async resolveSource(audioUri: string, bpm: number, durationSeconds?: number): Promise<string> {
    if (!audioUri.startsWith('synthesized:')) return audioUri;
    const duration = durationSeconds || 15;
    const key = `${audioUri}_${bpm}_${duration}`;
    let uri = this.synthesizedUris.get(key);
    if (!uri) {
      const name = key.replace(/[^a-z0-9_]/gi, '_');
      const preset = getPresetByAudioUri(audioUri) ?? FUR_ELISE;
      uri = await writeGeneratedWav(
        name,
        renderPresetTrack(preset.melody, bpm, duration, preset.beatsPerMeasure)
      );
      this.synthesizedUris.set(key, uri);
    }
    return uri;
  }

  /** Loads a track (file URI or `synthesized:` starter song) and waits until it is playable. */
  public async loadTrack(
    _songId: string,
    audioUri: string,
    bpm: number,
    durationSeconds?: number
  ): Promise<void> {
    const token = ++this.loadToken;
    // Halt without seeking: play() seeks to its own offset anyway. A seek to 0
    // here raced with play()'s seek and could restart the audio from the top
    // while the clock continued from the resume point (the editor's playhead
    // then snapped back and forth).
    this.halt();

    const source = await this.resolveSource(audioUri, bpm, durationSeconds);
    if (token !== this.loadToken) return; // superseded by a newer load

    if (this.track && this.currentSource === source && this.trackLoaded) {
      return; // same track already loaded (e.g. "Play Again")
    }

    this.trackLoaded = false;
    this.duration = durationSeconds || 15;
    this.currentSource = source;
    this.trackSubscription?.remove();
    if (!this.track) {
      this.track = createAudioPlayer(source, { updateInterval: STATUS_INTERVAL_MS });
    } else {
      this.track.replace(source);
    }
    this.trackSubscription = this.track.addListener('playbackStatusUpdate', this.handleStatus);

    // Wait for the "loaded" status event (async) instead of polling isLoaded
    await new Promise<void>((resolve) => {
      const start = Date.now();
      const check = () => {
        if (this.trackLoaded || token !== this.loadToken || Date.now() - start > LOAD_TIMEOUT_MS) {
          resolve();
        } else {
          setTimeout(check, 30);
        }
      };
      check();
    });
  }

  /** Starts playback from an offset in seconds. */
  public play(startOffsetSeconds: number = 0): void {
    if (!this.track) return;
    const offset = Math.max(0, startOffsetSeconds);
    this.pausedAt = offset;
    this.isPlaying = true;
    this.setAnchor(offset, false);

    // Safety net: if no status event confirms playback, start the clock anyway
    this.clearStartTimer();
    this.startTimer = setTimeout(() => {
      if (this.isPlaying && !this.clockRunning) this.setAnchor(this.anchorPos, true);
    }, START_TIMEOUT_MS);

    const player = this.track;
    player
      .seekTo(offset)
      .catch(() => {})
      .finally(() => {
        if (this.isPlaying && this.track === player) player.play();
      });
  }

  public pause(): void {
    if (!this.isPlaying) return;
    this.pausedAt = this.getCurrentTime();
    this.isPlaying = false;
    this.clockRunning = false;
    this.clearStartTimer();
    this.track?.pause();
    this.emitClock();
  }

  /** Stops the clock and the player without moving the playback position. */
  private halt(): void {
    const wasActive = this.isPlaying || this.pausedAt !== 0;
    this.isPlaying = false;
    this.clockRunning = false;
    this.pausedAt = 0;
    this.clearStartTimer();
    this.track?.pause();
    if (wasActive) this.emitClock();
  }

  public stop(): void {
    const wasActive = this.isPlaying || this.pausedAt !== 0;
    this.isPlaying = false;
    this.clockRunning = false;
    this.pausedAt = 0;
    this.clearStartTimer();
    if (this.track) {
      this.track.pause();
      this.track.seekTo(0).catch(() => {});
    }
    if (wasActive) this.emitClock();
  }

  public seek(seconds: number): void {
    const wasPlaying = this.isPlaying;
    if (wasPlaying) this.pause();
    this.pausedAt = Math.max(0, seconds);
    this.track?.seekTo(this.pausedAt).catch(() => {});
    if (wasPlaying) this.play(this.pausedAt);
    else this.emitClock();
  }
}

export const audioService = new AudioEngine();
