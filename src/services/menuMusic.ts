/**
 * Background music for the menus.
 *
 * - Starts when the app launches, loops forever.
 * - Around every loop point the volume follows a smooth curve: it eases down
 *   to silence over the last seconds of the track, and eases back up over the
 *   first seconds after it starts again, so the loop never "clicks".
 * - Fades out (then pauses) while you play a level or use the editor, when the
 *   app goes to the background, or when you switch it off in Settings; fades
 *   back in afterwards.
 * - No hit sounds: this is only menu music.
 *
 * On/off and volume are saved on the device.
 */
import { AppState } from 'react-native';
import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { MENU_MUSIC_SOURCE } from './menuMusicSource';

const SETTINGS_KEY = 'tilepulse_menu_music_v1';
const TICK_MS = 50;
/** Loop-point fades (seconds of the track). */
const LOOP_FADE_OUT_S = 4;
const LOOP_FADE_IN_S = 3;
/** Fades when switching off / pausing for gameplay / coming back (seconds). */
const MASTER_FADE_OUT_S = 0.8;
const MASTER_FADE_IN_S = 1.6;

export interface MenuMusicSettings {
  enabled: boolean;
  /** 0–1 */
  volume: number;
}

/** Smooth S-curve: slow start, slow end (no audible "corner"). */
const ease = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * x * (x * (6 * x - 15) + 10); // smootherstep
};

let settings: MenuMusicSettings = { enabled: true, volume: 0.6 };
let settingsLoaded = false;
const settingListeners = new Set<() => void>();

let player: AudioPlayer | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let started = false;
/** 0–1, multiplied in: fades the whole thing in / out. */
let master = 0;
let masterTarget = 0;
/** Why the music should be quiet right now ('play', 'editor', 'background'). */
const holds = new Set<string>();

export const hasMenuMusic = () => MENU_MUSIC_SOURCE != null;

function emitSettings() {
  settingListeners.forEach((l) => l());
}

async function loadSettings() {
  if (settingsLoaded) return;
  settingsLoaded = true;
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      settings = {
        enabled: typeof s.enabled === 'boolean' ? s.enabled : true,
        volume: typeof s.volume === 'number' ? Math.min(1, Math.max(0, s.volume)) : 0.6,
      };
      emitSettings();
    }
  } catch {
    /* defaults */
  }
}

function wantsSound() {
  return settings.enabled && settings.volume > 0 && holds.size === 0;
}

/** Volume from the position in the track: quiet near the loop point, full in between. */
function loopGain(p: AudioPlayer): number {
  const pos = p.currentTime || 0;
  const dur = p.duration || 0;
  if (!dur || dur < LOOP_FADE_IN_S + LOOP_FADE_OUT_S + 1) return 1;
  const fadeIn = ease(pos / LOOP_FADE_IN_S);
  const fadeOut = ease((dur - pos) / LOOP_FADE_OUT_S);
  return Math.min(fadeIn, fadeOut);
}

function tick() {
  const p = player;
  if (!p) return;
  // Master fade towards its target
  const step = TICK_MS / 1000 / (masterTarget > master ? MASTER_FADE_IN_S : MASTER_FADE_OUT_S);
  if (master < masterTarget) master = Math.min(masterTarget, master + step);
  else if (master > masterTarget) master = Math.max(masterTarget, master - step);

  try {
    p.volume = ease(master) * loopGain(p) * settings.volume;
    if (master === 0 && masterTarget === 0) {
      if (p.playing) p.pause();
      stopTicking(); // nothing to do until the music is wanted again
    }
  } catch {
    /* player released */
  }
}

function startTicking() {
  if (!timer) timer = setInterval(tick, TICK_MS);
}
function stopTicking() {
  if (timer) clearInterval(timer);
  timer = null;
}

/** Re-evaluates whether the music should play and starts the right fade. */
function update() {
  if (!started || !MENU_MUSIC_SOURCE) return;
  if (wantsSound()) {
    if (!player) {
      try {
        player = createAudioPlayer(MENU_MUSIC_SOURCE, { updateInterval: 250 });
        player.loop = true;
        player.volume = 0;
      } catch (err) {
        console.warn('Menu music failed to load:', err);
        return;
      }
    }
    masterTarget = 1;
    try {
      if (!player.playing) player.play();
    } catch {
      /* web autoplay can be blocked until the first tap; retried on the next update */
    }
    startTicking();
  } else if (player) {
    masterTarget = 0;
    startTicking(); // fade out, then pause
  }
}

/** Starts the menu music (call once when the app is ready). */
export function startMenuMusic() {
  if (started) return;
  started = true;
  AppState.addEventListener('change', (state) => {
    if (state === 'active') holds.delete('background');
    else holds.add('background');
    update();
  });
  void loadSettings().then(update);
}

/**
 * Keeps the music quiet while something else plays audio (a level, the
 * editor). Returns a function that releases it.
 */
export function holdMenuMusic(reason: string): () => void {
  holds.add(reason);
  update();
  return () => {
    holds.delete(reason);
    update();
  };
}

export function setMenuMusicSettings(changes: Partial<MenuMusicSettings>) {
  settings = { ...settings, ...changes, volume: Math.min(1, Math.max(0, changes.volume ?? settings.volume)) };
  emitSettings();
  AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)).catch(() => {});
  update();
}

/** Live settings for the Settings sheet. */
export function useMenuMusicSettings(): MenuMusicSettings {
  return useSyncExternalStore(
    (l) => {
      settingListeners.add(l);
      void loadSettings();
      return () => settingListeners.delete(l);
    },
    () => settings,
    () => settings
  );
}
