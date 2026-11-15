/**
 * Audio engine for TilePulse, built on expo-audio (iOS, Android and web).
 *
 * - Music tracks (uploaded files or the rendered starter song) play through
 *   one main AudioPlayer.
 * - Hit chimes and hold ticks are pre-rendered WAVs played from small player
 *   pools so rapid taps can overlap.
 * - getCurrentTime() is the game's master clock: it extrapolates between the
 *   player's reported positions with a monotonic timer for smooth tile motion
 *   and re-syncs whenever the player drifts.
 */

import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { renderHitSound, renderHoldTick, renderStarterTrack } from '../audio/synth';
import { writeGeneratedWav } from './audioFileStore';

const LANE_FREQUENCIES = [261.63, 329.63, 392.0, 523.25]; // C4, E4, G4, C5
const VOICES_PER_LANE = 2;
const LOAD_TIMEOUT_MS = 5000;
const DRIFT_TOLERANCE_SEC = 0.06;

const now = () => (globalThis.performance?.now?.() ?? Date.now()) / 1000;

class AudioEngine {
  private track: AudioPlayer | null = null;
  private trackSubscription: { remove: () => void } | null = null;
  private hitVoices: AudioPlayer[][] = [];
  private hitVoiceCursor = [0, 0, 0, 0];
  private tickVoices: AudioPlayer[] = [];
  private tickCursor = 0;
  private sfxReady: Promise<void> | null = null;
  private synthesizedUris = new Map<string, string>();

  private isPlaying = false;
  private duration = 15;
  private pausedAt = 0;
  // Clock anchor: track position `anchorPos` was observed at monotonic time `anchorTime`
  private anchorPos = 0;
  private anchorTime = 0;
  private clockStarted = false;
  private lastReportedPos = -1;
  private loadToken = 0;

  constructor() {
    setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' }).catch(
      (err) => console.warn('Failed to set audio mode:', err)
    );
  }

  /** Renders and loads the hit/tick sound effects once. Never rejects. */
  public prepareEffects(): Promise<void> {
    if (!this.sfxReady) {
      this.sfxReady = (async () => {
        try {
          const laneUris = await Promise.all(
            LANE_FREQUENCIES.map((f, i) => writeGeneratedWav(`hit_lane_${i}`, renderHitSound(f)))
          );
          this.hitVoices = laneUris.map((uri) =>
            Array.from({ length: VOICES_PER_LANE }, () => createAudioPlayer(uri))
          );
          const tickUri = await writeGeneratedWav('hold_tick', renderHoldTick());
          this.tickVoices = [createAudioPlayer(tickUri), createAudioPlayer(tickUri)];
        } catch (err) {
          console.warn('Failed to prepare sound effects:', err);
        }
      })();
    }
    return this.sfxReady;
  }

  private async resolveSource(audioUri: string, bpm: number, durationSeconds?: number): Promise<string> {
    if (!audioUri.startsWith('synthesized:')) return audioUri;
    const duration = durationSeconds || 15;
    const key = `${audioUri}_${bpm}_${duration}`;
    let uri = this.synthesizedUris.get(key);
    if (!uri) {
      const name = key.replace(/[^a-z0-9_]/gi, '_');
      uri = await writeGeneratedWav(name, renderStarterTrack(bpm, duration));
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
    this.stop();
    void this.prepareEffects();

    const source = await this.resolveSource(audioUri, bpm, durationSeconds);
    if (token !== this.loadToken) return; // superseded by a newer load

    this.trackSubscription?.remove();
    if (!this.track) {
      this.track = createAudioPlayer(source, { updateInterval: 100 });
    } else {
      this.track.replace(source);
    }
    const player = this.track;

    this.trackSubscription = player.addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish) {
        this.pausedAt = this.getCurrentTime();
        this.isPlaying = false;
      }
    });

    await new Promise<void>((resolve) => {
      const start = Date.now();
      const check = () => {
        if (player.isLoaded || token !== this.loadToken || Date.now() - start > LOAD_TIMEOUT_MS) {
          resolve();
        } else {
          setTimeout(check, 30);
        }
      };
      check();
    });

    this.duration = player.duration > 0 ? player.duration : durationSeconds || 15;
  }

  /** Starts playback from an offset in seconds. */
  public play(startOffsetSeconds: number = 0): void {
    if (!this.track) return;
    const offset = Math.max(0, startOffsetSeconds);
    this.pausedAt = offset;
    this.anchorPos = offset;
    this.anchorTime = now();
    this.clockStarted = false;
    this.lastReportedPos = -1;
    this.isPlaying = true;

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
    this.track?.pause();
  }

  public stop(): void {
    this.isPlaying = false;
    this.pausedAt = 0;
    if (this.track) {
      this.track.pause();
      this.track.seekTo(0).catch(() => {});
    }
  }

  public seek(seconds: number): void {
    const wasPlaying = this.isPlaying;
    if (wasPlaying) this.pause();
    this.pausedAt = Math.max(0, seconds);
    this.track?.seekTo(this.pausedAt).catch(() => {});
    if (wasPlaying) this.play(this.pausedAt);
  }

  /** Current playback position in seconds — the master clock for the game loop. */
  public getCurrentTime(): number {
    if (!this.isPlaying || !this.track) return this.pausedAt;

    const reported = this.track.currentTime;
    const t = now();

    if (!this.clockStarted) {
      // Hold the clock until audio output has actually started, so tiles
      // don't run ahead of the music during player startup latency.
      // Positions outside [offset, offset + 0.5s] are stale (seek not finished yet).
      const advanced = reported > this.anchorPos + 0.001 && reported < this.anchorPos + 0.5;
      const timedOut = t - this.anchorTime > 1.0; // never stall the game indefinitely
      if ((this.track.playing && advanced) || timedOut) {
        this.clockStarted = true;
        if (advanced) this.anchorPos = reported;
        this.anchorTime = t;
        this.lastReportedPos = reported;
      }
      return this.anchorPos;
    }

    const estimate = this.anchorPos + (t - this.anchorTime);
    if (reported !== this.lastReportedPos) {
      this.lastReportedPos = reported;
      if (Math.abs(reported - estimate) > DRIFT_TOLERANCE_SEC) {
        this.anchorPos = reported;
        this.anchorTime = t;
        return reported;
      }
    }
    return Math.min(estimate, this.duration);
  }

  public getDuration(): number {
    return this.duration;
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  private trigger(player: AudioPlayer | undefined, volume: number): void {
    if (!player) return;
    try {
      player.volume = volume;
      player.seekTo(0).catch(() => {});
      player.play();
    } catch {
      // Player not ready yet; skip this sound
    }
  }

  /** Plays a short piano chime for the lane. */
  public playHitSound(lane: 0 | 1 | 2 | 3, isPerfect: boolean = true): void {
    const voices = this.hitVoices[lane];
    if (!voices?.length) {
      void this.prepareEffects();
      return;
    }
    const idx = this.hitVoiceCursor[lane];
    this.hitVoiceCursor[lane] = (idx + 1) % voices.length;
    this.trigger(voices[idx], isPerfect ? 1 : 0.6);
  }

  /** Short tick while a hold tile is held. */
  public playHoldTick(_progress: number): void {
    if (!this.tickVoices.length) return;
    const idx = this.tickCursor;
    this.tickCursor = (idx + 1) % this.tickVoices.length;
    this.trigger(this.tickVoices[idx], 0.5);
  }
}

export const audioService = new AudioEngine();
