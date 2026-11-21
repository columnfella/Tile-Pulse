/**
 * Developer announcements: short messages from the TilePulse team (e.g. "a new
 * version is out"), created from the admin console. Everyone who opens the app
 * sees each one once (signed in or not); which ones were seen is remembered on
 * this device. Public endpoint: GET /api/v1/announcements?platform=…
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiRequest } from './account';

export interface Announcement {
  id: number;
  title: string;
  body: string;
  link: { url: string; label: string } | null;
}

const SEEN_KEY = 'tilepulse_seen_announcements_v1';
const KEEP_SEEN = 50;

const platform = Platform.OS === 'android' ? 'android' : Platform.OS === 'ios' ? 'ios' : 'web';

async function seenIds(): Promise<number[]> {
  try {
    const v = JSON.parse((await AsyncStorage.getItem(SEEN_KEY)) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'number') : [];
  } catch {
    return [];
  }
}

/** The announcements this device hasn't seen yet, newest first ([] when offline). */
export async function getUnseenAnnouncements(): Promise<Announcement[]> {
  try {
    const r = await apiRequest<{ announcements: Announcement[] }>('GET', `/announcements?platform=${platform}`, { auth: false });
    const seen = new Set(await seenIds());
    // Only https links are ever opened (the server enforces this too)
    return (r.announcements ?? [])
      .filter((a) => !seen.has(a.id))
      .map((a) => ({ ...a, link: a.link && /^https:\/\//.test(a.link.url) ? a.link : null }));
  } catch {
    return []; // offline / server down: try again next time
  }
}

export async function markAnnouncementSeen(id: number): Promise<void> {
  const ids = [...new Set([id, ...(await seenIds())])].slice(0, KEEP_SEEN);
  await AsyncStorage.setItem(SEEN_KEY, JSON.stringify(ids)).catch(() => {});
}
