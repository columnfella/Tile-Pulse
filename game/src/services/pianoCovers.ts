/**
 * Cover pictures for the built-in sample levels: random piano photos from
 * Wikimedia Commons (free, openly licensed, no API key), from the category
 * "Piano keyboards". Each sample gets one at random the first time, then keeps
 * it on this device (so covers don't change every launch). Photos are credited
 * (author + licence) as their licences require.
 *
 * Offline / API down: no cover, the card simply shows without one.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Wikimedia refuses requests from generic HTTP clients (403 "Please set a
 * user-agent"), which is what the phone app sends by default: name the app.
 * Browsers send their own and don't allow changing it, so only on the app.
 */
const WIKIMEDIA_HEADERS: Record<string, string> | undefined =
  Platform.OS === 'web' ? undefined : { 'User-Agent': 'TilePulse/1.0 (rhythm game app)' };

/** Image source for a cover picture (adds the app name for Wikimedia photos). */
export const coverImageSource = (uri: string) =>
  WIKIMEDIA_HEADERS && /^https:\/\/upload\.wikimedia\.org\//.test(uri) ? { uri, headers: WIKIMEDIA_HEADERS } : { uri };

export interface PianoCover {
  url: string;
  /** "Photo: <author> · <licence> · Wikimedia Commons" */
  credit: string;
}

const API =
  'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*' +
  '&generator=categorymembers&gcmtitle=Category:Piano_keyboards&gcmtype=file&gcmlimit=50' +
  '&prop=imageinfo&iiprop=url%7Csize%7Cmime%7Cextmetadata&iiextmetadatafilter=Artist%7CLicenseShortName&iiurlwidth=800';
const KEY = 'tilepulse_piano_covers_v1';
const TIMEOUT_MS = 8000;

let picks: Record<string, PianoCover> | null = null;
let pool: Promise<PianoCover[]> | null = null;

/** Plain text from Commons' HTML author field. */
const plain = (html: string) =>
  html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

function loadPool(): Promise<PianoCover[]> {
  pool ??= (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(API, { signal: controller.signal, headers: WIKIMEDIA_HEADERS });
      const json = await res.json();
      const pages = Object.values(json?.query?.pages ?? {}) as {
        imageinfo?: { thumburl?: string; mime?: string; width?: number; height?: number; extmetadata?: Record<string, { value?: string }> }[];
      }[];
      return pages
        .map((p) => p.imageinfo?.[0])
        .filter(
          (i): i is NonNullable<typeof i> =>
            // Landscape photos, big enough to look sharp, served over https
            !!i && i.mime === 'image/jpeg' && (i.width ?? 0) >= 1200 && (i.width ?? 0) > (i.height ?? 0) * 1.2 && /^https:\/\//.test(i.thumburl ?? '')
        )
        .map((i) => {
          const author = plain(i.extmetadata?.Artist?.value ?? '').slice(0, 60) || 'Unknown author';
          const licence = plain(i.extmetadata?.LicenseShortName?.value ?? '') || 'see Wikimedia Commons';
          return { url: i.thumburl!, credit: `Photo: ${author} · ${licence} · Wikimedia Commons` };
        });
    } catch {
      pool = null; // try again next time
      return [];
    } finally {
      clearTimeout(timer);
    }
  })();
  return pool;
}

async function loadPicks(): Promise<Record<string, PianoCover>> {
  if (picks) return picks;
  try {
    picks = JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}') ?? {};
  } catch {
    picks = {};
  }
  return picks!;
}

/** The piano photo for a built-in sample level (null when offline). */
export async function getPianoCover(songId: string): Promise<PianoCover | null> {
  const saved = await loadPicks();
  if (saved[songId]) return saved[songId];
  const photos = await loadPool();
  if (!photos.length) return null;
  // A different photo for each sample where possible
  const taken = new Set(Object.values(saved).map((c) => c.url));
  const free = photos.filter((p) => !taken.has(p.url));
  const choice = (free.length ? free : photos)[Math.floor(Math.random() * (free.length || photos.length))];
  saved[songId] = choice;
  await AsyncStorage.setItem(KEY, JSON.stringify(saved)).catch(() => {});
  return choice;
}
