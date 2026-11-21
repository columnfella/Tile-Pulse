/**
 * Developer announcements: short messages from the TilePulse team (e.g. "a new
 * version is out"), created from the admin console. Public: everyone gets them,
 * signed in or not (GET /api/v1/announcements?platform=…).
 *
 * Each new one pops up once (AnnouncementHost) and stays in the Inbox while it's
 * live. "Seen" is remembered on this device, shared by both: dismissing the pop-up
 * or opening the Inbox clears it from the red badges.
 */
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiRequest } from './account';
import { setSocialCounts } from './socialCounts';

export interface Announcement {
  id: number;
  title: string;
  body: string;
  link: { url: string; label: string } | null;
  createdAt: number;
}

const SEEN_KEY = 'tilepulse_seen_announcements_v1';
const KEEP_SEEN = 50;
const platform = Platform.OS === 'android' ? 'android' : Platform.OS === 'ios' ? 'ios' : 'web';

let active: Announcement[] = [];
let seen: Set<number> | null = null;
let version = 0;
const listeners = new Set<() => void>();
const changed = () => {
  version++;
  setSocialCounts({ announcements: active.filter((a) => !seen?.has(a.id)).length });
  listeners.forEach((l) => l());
};

async function loadSeen(): Promise<Set<number>> {
  if (seen) return seen;
  try {
    const v = JSON.parse((await AsyncStorage.getItem(SEEN_KEY)) ?? '[]');
    seen = new Set(Array.isArray(v) ? v.filter((x) => typeof x === 'number') : []);
  } catch {
    seen = new Set();
  }
  return seen;
}

/** Fetches the live announcements (keeps the last list when offline). */
export async function refreshAnnouncements(): Promise<Announcement[]> {
  await loadSeen();
  try {
    const r = await apiRequest<{ announcements: Announcement[] }>('GET', `/announcements?platform=${platform}`, { auth: false });
    // Only https links are ever opened (the server enforces this too)
    active = (r.announcements ?? []).map((a) => ({ ...a, link: a.link && /^https:\/\//.test(a.link.url) ? a.link : null }));
  } catch {
    /* offline / server down: keep what we had */
  }
  changed();
  return active;
}

/** Live announcements this device hasn't seen yet, newest first. */
export async function getUnseenAnnouncements(): Promise<Announcement[]> {
  const list = await refreshAnnouncements();
  return list.filter((a) => !seen!.has(a.id));
}

export async function markAnnouncementsSeen(ids: number[]): Promise<void> {
  const s = await loadSeen();
  if (ids.every((id) => s.has(id))) return;
  ids.forEach((id) => s.add(id));
  changed();
  await AsyncStorage.setItem(SEEN_KEY, JSON.stringify([...s].slice(-KEEP_SEEN))).catch(() => {});
}

export const markAnnouncementSeen = (id: number) => markAnnouncementsSeen([id]);

/** React hook: the live announcements and which ones were already seen. */
export function useAnnouncements(): { list: Announcement[]; isNew: (id: number) => boolean } {
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
    () => version
  );
  return { list: active, isNew: (id) => !seen?.has(id) };
}
