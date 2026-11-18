/**
 * The menu music track. Bundled with the app (no download), played by
 * menuMusic.ts on the home screens.
 *
 * To set it: put the audio file at  src/assets/audio/menu-music.mp3  and change
 * the line below to
 *
 *   export const MENU_MUSIC_SOURCE: number | null = require('../assets/audio/menu-music.mp3');
 *
 * Only use music you're allowed to use: check the track's licence (and credit
 * the artist if it asks for it). Until a file is set, the app simply has no
 * menu music and the setting says so.
 */
export const MENU_MUSIC_SOURCE: number | null = null;

/** Shown in Settings as the track credit (if the licence asks for one). */
export const MENU_MUSIC_CREDIT: string | null = null;
