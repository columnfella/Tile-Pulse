/**
 * Background music for the menus: a shuffled playlist of every track in
 * src/assets/audio/menu/ (see menuMusicTracks.ts).
 *
 * - Starts when the app launches and keeps going: tracks play in random order,
 *   each once before any repeats, never the same one twice in a row (a single
 *   track just loops).
 * - At every track change the volume follows a smooth curve: it eases down to
 *   silence over the last seconds of a track and eases back up over the first
 *   seconds of the next, so changes never "click".
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
import { MENU_TRACKS, type MenuTrack } from './menuMusicTracks';

const SETTINGS_KEY = 'tilepulse_menu_music_v1';
const TICK_MS = 50;
/** Fades at the end / start of each track (seconds of the track). */
const TRACK_FADE_OUT_S = 4;
const TRACK_FADE_IN_S = 3;
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
let nowPlaying: string | null = null;
/** Set every time a track starts playing (drives the credit pop-up). */
export interface TrackStart {
  id: number;
  track: MenuTrack;
  at: number;
}
let trackStart: TrackStart | null = null;
let trackStartId = 0;
const listeners = new Set<() => void>();

let player: AudioPlayer | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let started = false;
/** Last position seen, to notice a single looping track starting over. */
let lastPos = 0;
/** 0–1, multiplied in: fades the whole thing in / out. */
let master = 0;
let masterTarget = 0;
/** Why the music should be quiet right now ('play', 'editor', 'background'). */
const holds = new Set<string>();

/* --------------------------------- playlist --------------------------------- */

let bag: number[] = [];
let current = -1;

/** Next track index: a shuffled "bag" of all tracks, refilled when empty. */
function nextIndex(): number {
  const n = MENU_TRACKS.length;
  if (n <= 1) return 0;
  if (bag.length === 0) {
    bag = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    // Never the same track twice in a row across refills
    if (bag[0] === current) bag.push(bag.shift()!);
  }
  return bag.shift()!;
}

function playTrack(index: number) {
  const track = MENU_TRACKS[index];
  if (!track) return;
  current = index;
  nowPlaying = track.title;
  emit();
  try {
    if (!player) {
      player = createAudioPlayer(track.source, { updateInterval: 250 });
      player.addListener('playbackStatusUpdate', (status) => {
        if (status.didJustFinish && MENU_TRACKS.length > 1) playTrack(nextIndex());
      });
    } else {
      player.replace(track.source);
    }
    player.loop = MENU_TRACKS.length === 1;
    player.volume = 0;
    if (masterTarget > 0) {
      player.play();
      trackStart = { id: ++trackStartId, track, at: Date.now() };
      emit();
    }
  } catch (err) {
    console.warn('Menu music failed to load:', err);
  }
}

/* ---------------------------------- engine ---------------------------------- */

export const hasMenuMusic = () => MENU_TRACKS.length > 0;
export const menuTrackCount = () => MENU_TRACKS.length;

function emit() {
  listeners.forEach((l) => l());
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
      emit();
    }
  } catch {
    /* defaults */
  }
}

function wantsSound() {
  return settings.enabled && settings.volume > 0 && holds.size === 0;
}

/** Volume from the position in the track: quiet at its start and end, full in between. */
function trackGain(p: AudioPlayer): number {
  const pos = p.currentTime || 0;
  const dur = p.duration || 0;
  if (!dur || dur < TRACK_FADE_IN_S + TRACK_FADE_OUT_S + 1) return 1;
  return Math.min(ease(pos / TRACK_FADE_IN_S), ease((dur - pos) / TRACK_FADE_OUT_S));
}

function tick() {
  const p = player;
  if (!p) return;
  const step = TICK_MS / 1000 / (masterTarget > master ? MASTER_FADE_IN_S : MASTER_FADE_OUT_S);
  if (master < masterTarget) master = Math.min(masterTarget, master + step);
  else if (master > masterTarget) master = Math.max(masterTarget, master - step);

  try {
    const pos = p.currentTime || 0;
    // One track on loop: each restart counts as the song starting again (credit pop-up)
    if (p.loop && master > 0 && pos + 1 < lastPos && current >= 0) {
      trackStart = { id: ++trackStartId, track: MENU_TRACKS[current], at: Date.now() };
      emit();
    }
    lastPos = pos;
    p.volume = ease(master) * trackGain(p) * settings.volume;
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
  if (!started || !hasMenuMusic()) return;
  if (wantsSound()) {
    masterTarget = 1;
    if (!player) playTrack(nextIndex());
    else {
      try {
        if (!player.playing) player.play();
      } catch {
        /* web autoplay can be blocked until the first tap; retried on the next update */
      }
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

/** Skips to another random track (Settings → Next). */
export function skipMenuTrack() {
  if (MENU_TRACKS.length > 1 && player) playTrack(nextIndex());
}

export function setMenuMusicSettings(changes: Partial<MenuMusicSettings>) {
  settings = { ...settings, ...changes, volume: Math.min(1, Math.max(0, changes.volume ?? settings.volume)) };
  emit();
  AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)).catch(() => {});
  update();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  void loadSettings();
  return () => {
    listeners.delete(l);
  };
};

/** Live settings for the Settings sheet. */
export function useMenuMusicSettings(): MenuMusicSettings {
  return useSyncExternalStore(subscribe, () => settings, () => settings);
}

/** The latest track start (for the "now playing" credit pop-up). */
export function useTrackStart(): TrackStart | null {
  return useSyncExternalStore(subscribe, () => trackStart, () => null);
}

/** Credit of the track playing now, if it has one. */
export const currentCredit = () => (current >= 0 ? (MENU_TRACKS[current]?.credit ?? null) : null);

/** Title of the track playing now (null before the music starts). */
export function useNowPlaying(): string | null {
  return useSyncExternalStore(subscribe, () => nowPlaying, () => null);
}
