/**
 * THEMES: every colour the app's UI and play screen use comes from here.
 *
 * - The themes themselves (8 of them, 14 colours each) live in themes.json, which
 *   the website also reads (it always uses the default theme, Dusty Dusk).
 * - derivePalette() turns a theme's 14 colours into the full set of named
 *   colours the screens use (`C.panel`, `C.textDim`, `C.accent`, …).
 * - The player picks a theme under Appearance (Songs tab); it is saved on the
 *   device and restored on the next launch (falls back to the default theme).
 *
 * How screens read colours (no inline per-component colouring):
 *   const styles = themedStyles(() => ({ card: { backgroundColor: C.panel } }));
 *   const LOOK = themed(() => ({ ok: C.success }));   // module-level constants
 *   <Text style={{ color: C.text }} />                   // during render
 * `C`, themedStyles() and themed() always return the ACTIVE theme's values.
 * When the theme changes, the app re-renders its screens (app/_layout.tsx), so
 * everything picks up the new colours immediately, without a reload.
 *
 * Adding a ninth theme: add an entry to themes.json. Nothing else.
 */
import { useSyncExternalStore } from 'react';
import { StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import THEME_FILE from './themes.json';

/* --------------------------------- themes --------------------------------- */

/** The 14 colours every theme defines. */
export interface ThemeColors {
  background: string;
  backgroundSecondary: string;
  surface: string;
  surfaceHover: string;
  surfaceActive: string;
  border: string;
  primary: string;
  primaryHover: string;
  secondary: string;
  highlight: string;
  text: string;
  textMuted: string;
  success: string;
  error: string;
}

export interface ThemeDefinition {
  id: string;
  name: string;
  mood: string;
  colors: ThemeColors;
}

export const THEMES: readonly ThemeDefinition[] = THEME_FILE.themes;
export const DEFAULT_THEME_ID: string = THEME_FILE.default;
const THEME_BY_ID = new Map(THEMES.map((t) => [t.id, t]));
export const isThemeId = (v: unknown): v is string => typeof v === 'string' && THEME_BY_ID.has(v);

/* ------------------------------ colour maths ------------------------------ */

const toRgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((ch) => ch + ch).join('') : h.slice(0, 6);
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = (rgb: number[]) =>
  '#' + rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');

/** Blend colour `a` towards colour `b` by `t` (0 = a, 1 = b). */
export function mix(a: string, b: string, t: number): string {
  const x = toRgb(a);
  const y = toRgb(b);
  return toHex(x.map((v, i) => v + (y[i] - v) * t));
}

/** A colour ('#rrggbb') at the given opacity (0…1), as an rgba() string. */
export function alpha(hex: string, opacity: number): string {
  const [r, g, b] = toRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/* -------------------------------- palette --------------------------------- */

/**
 * Every named colour the screens use, derived from a theme's 14 colours.
 * The theme's own names are included as they are (background, surface,
 * primary, …); the rest are the roles the UI was built with.
 */
export interface Palette extends ThemeColors {
  id: string;
  name: string;

  /* surfaces */
  bg: string; // app background
  bgDeep: string; // inputs and wells inside cards
  panel: string; // cards, sheets, sections
  card: string;
  panelLight: string; // card borders, small button fills

  /* lines */
  lineSoft: string; // row separators
  line: string; // input borders
  lineStrong: string;

  /* text and icons */
  textStrong: string; // titles
  textSoft: string; // icons on buttons
  textDim: string; // secondary text
  textSubtle: string; // hints, placeholders
  textFaint: string; // disabled icons, chevrons

  /* black / white roles */
  outline: string; // the pixel-art outline
  onAccent: string; // text and icons on primary / success buttons
  black: string; // deep shadows, scrims
  white: string; // light flashes and highlights

  /* main accent (buttons, active states, hold tiles) */
  accent: string;
  accentLight: string;
  accentSoft: string;
  accentDark: string;
  accentDeep: string;

  /* tiles and secondary indicators (links, info, selection) */
  blue: string; // secondary indicators: links, info text, loaders
  blueStrong: string; // tap tiles
  blueLight: string; // tile top bevel
  bluePale: string;
  blueMist: string;
  blueSky: string;
  blueDark: string; // tile bottom bevel
  blueDeeper: string;
  blueNight: string; // info banner fill
  blueAbyss: string;

  /* status */
  gold: string; // scores, stars, medals
  warning: string;
  yellow: string;
  danger: string;
  dangerSoft: string;
  dangerDeep: string;
  successBright: string;
  successDeep: string;
  successDark: string;
  /** Second difficulty / category tint (e.g. "Normal" levels). */
  tint2: string;
  /** Third difficulty / category tint (e.g. "Hard" levels). */
  tint3: string;
}

/** Muted amber, nudged towards each theme's highlight so it always fits. */
const AMBER = '#d4b06a';

export function derivePalette(theme: ThemeDefinition): Palette {
  const t = theme.colors;
  const ink = mix(t.background, '#000000', 0.6);
  return {
    ...t,
    id: theme.id,
    name: theme.name,

    bg: t.background,
    bgDeep: mix(t.background, ink, 0.35),
    panel: t.surface,
    card: t.surface,
    panelLight: t.border,

    lineSoft: mix(t.border, t.surface, 0.55),
    line: t.border,
    lineStrong: t.surfaceActive,

    textStrong: t.text,
    textSoft: mix(t.text, t.textMuted, 0.35),
    textDim: t.textMuted,
    textSubtle: mix(t.textMuted, t.background, 0.28),
    textFaint: mix(t.textMuted, t.background, 0.55),

    outline: ink,
    // A touch darker than the background, so text on the accent stays readable (≥ 4.5:1)
    onAccent: mix(t.background, '#000000', 0.4),
    black: ink,
    white: mix(t.text, '#ffffff', 0.5),

    accent: t.primary,
    accentLight: t.primaryHover,
    accentSoft: mix(t.primaryHover, t.text, 0.35),
    accentDark: mix(t.primary, t.background, 0.3),
    accentDeep: mix(t.primary, t.background, 0.55),

    blue: t.highlight,
    blueStrong: t.primary,
    blueLight: t.primaryHover,
    bluePale: mix(t.primaryHover, t.highlight, 0.5),
    blueMist: mix(t.highlight, t.text, 0.3),
    blueSky: mix(t.highlight, t.text, 0.5),
    blueDark: mix(t.primary, t.background, 0.5),
    blueDeeper: mix(t.primary, t.background, 0.4),
    blueNight: mix(t.highlight, t.background, 0.88),
    blueAbyss: mix(t.primary, t.background, 0.75),

    gold: mix(AMBER, t.highlight, 0.2),
    warning: mix(AMBER, t.highlight, 0.1),
    yellow: mix(AMBER, t.highlight, 0.35),
    danger: t.error,
    dangerSoft: mix(t.error, t.text, 0.3),
    dangerDeep: mix(t.error, t.background, 0.6),
    successBright: mix(t.success, t.text, 0.3),
    successDeep: mix(t.success, t.background, 0.55),
    successDark: mix(t.success, t.background, 0.35),
    tint2: t.secondary,
    tint3: t.primaryHover,
  };
}

const PALETTES = new Map<string, Palette>(THEMES.map((t) => [t.id, derivePalette(t)]));

/* --------------------------- active theme (store) -------------------------- */

const STORAGE_KEY = 'tilepulse_theme_v1';
let activeId: string = DEFAULT_THEME_ID;
let loadPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

export const getThemeId = () => activeId;
export const getThemeDefinition = (id: string = activeId) => THEME_BY_ID.get(id) ?? THEME_BY_ID.get(DEFAULT_THEME_ID)!;
export const getPalette = (id: string = activeId) => PALETTES.get(id) ?? PALETTES.get(DEFAULT_THEME_ID)!;

/** Restores the saved theme (once). Missing or unknown values fall back to the default. */
export function loadSavedTheme(): Promise<void> {
  loadPromise ??= AsyncStorage.getItem(STORAGE_KEY)
    .then((v) => {
      if (isThemeId(v) && v !== activeId) {
        activeId = v;
        listeners.forEach((l) => l());
      }
    })
    .catch(() => {});
  return loadPromise;
}

/** Switches the whole app to another theme (applies immediately) and saves it. */
export function setTheme(id: string): void {
  if (!isThemeId(id) || id === activeId) return;
  activeId = id;
  listeners.forEach((l) => l());
  AsyncStorage.setItem(STORAGE_KEY, id).catch((err) => console.warn('Failed to save theme:', err));
}

/** React hook: the active theme id (re-renders when it changes). */
export function useThemeId(): string {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => activeId,
    () => activeId
  );
}

/* ------------------------------ live accessors ----------------------------- */

/**
 * An object (or array) built from theme colours that always reflects the
 * active theme: `factory` runs once per theme and the result is cached.
 */
export function themed<T extends object>(factory: () => T): T {
  const cache = new Map<string, T>();
  const current = (): T => {
    let v = cache.get(activeId);
    if (!v) {
      v = factory();
      cache.set(activeId, v);
    }
    return v;
  };
  const target = (Array.isArray(current()) ? [] : {}) as T;
  return new Proxy(target, {
    get: (_t, key) => {
      const v = current() as Record<string | symbol, unknown>;
      const value = v[key];
      // Array methods (map, forEach…) must run against the real array
      return typeof value === 'function' && Array.isArray(v) ? (value as Function).bind(v) : value;
    },
    has: (_t, key) => key in current(),
    ownKeys: () => Reflect.ownKeys(current()),
    getOwnPropertyDescriptor: (t, key) => {
      const d = Reflect.getOwnPropertyDescriptor(current(), key);
      if (!d) return undefined;
      // Must match the proxy target where it has the same (non-configurable) property, e.g. array length
      const own = Reflect.getOwnPropertyDescriptor(t, key);
      return own && !own.configurable ? { ...d, configurable: false } : { ...d, configurable: true };
    },
  });
}

/** StyleSheet.create() for the active theme (rebuilt once per theme, then cached). */
type StyleInput = Parameters<typeof StyleSheet.create>[0];

export function themedStyles<S extends StyleInput>(factory: () => S): Readonly<S> {
  return themed(() => StyleSheet.create(factory()));
}

/** Opacity of the bars over the animated background (header, camera strip, tab bar). */
export const BAR_OPACITY = 0.72;

/** The active theme's colours. */
export const C: Palette = themed(() => getPalette());
