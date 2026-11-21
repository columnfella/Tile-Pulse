/**
 * Friends (added by @username), presence (what you're doing, sent to the
 * server every minute while the app is open) and the leaderboard.
 */
import { AppState } from 'react-native';
import { apiRequest, getSession, onSessionChange, updateSessionUser, type StaffRole } from './account';
import { clearPersonalCounts, setSocialCounts } from './socialCounts';
import type { ImageRef, Presence } from './profile';

export interface PlayerCard {
  id: string;
  username: string;
  displayName: string;
  avatar: ImageRef | null;
  /** Main badge id (owner, developer, moderator, …), on leaderboard rows. */
  badge?: string | null;
}

export interface Friend extends PlayerCard {
  since: number;
  presence: Presence;
}

export interface FriendRequest extends PlayerCard {
  at: number;
}

export interface FriendLists {
  friends: Friend[];
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
}

/** Every friends reply carries the lists: keep the FRIENDS badge (pending requests) in sync. */
const withCount = async <T extends FriendLists>(p: Promise<T>): Promise<T> => {
  const lists = await p;
  setSocialCounts({ requests: lists.incoming.length });
  return lists;
};

export const getFriends = () => withCount(apiRequest<FriendLists>('GET', '/friends'));

export const addFriend = (username: string) =>
  withCount(
    apiRequest<FriendLists & { status: 'friends' | 'outgoing' }>('POST', '/friends', {
      json: { username: username.trim().replace(/^@/, '') },
    })
  );

export const acceptFriend = (userId: string) => withCount(apiRequest<FriendLists>('POST', `/friends/${userId}/accept`));

/** Removes a friend, declines their request, or cancels yours. */
export const removeFriend = (userId: string) => withCount(apiRequest<FriendLists>('DELETE', `/friends/${userId}`));

/* -------------------------------- leaderboard ------------------------------- */

export interface LeaderboardEntry {
  rank: number;
  total: number;
  levels: number;
  player: PlayerCard;
}

export interface Leaderboard {
  players: LeaderboardEntry[];
  totalPlayers: number;
  me: { total: number; levels: number; rank: number | null } | null;
}

export const getLeaderboard = (limit = 50) => apiRequest<Leaderboard>('GET', `/leaderboard?limit=${limit}`);

/* --------------------------------- presence --------------------------------- */

type Activity = { kind: 'menu' | 'playing' | 'editing'; detail?: string };

const HEARTBEAT_MS = 60_000;
let activity: Activity = { kind: 'menu' };
let timer: ReturnType<typeof setInterval> | null = null;
let started = false;

async function beat() {
  const session = await getSession();
  if (AppState.currentState !== 'active' || !session) return;
  try {
    // The reply carries the inbox's unread count and your staff role (so a
    // promotion shows up without signing in again)
    const r = await apiRequest<{ unread?: number; unreadOther?: number; requests?: number; staffRole?: StaffRole } | undefined>('POST', '/me/presence', {
      json: { kind: activity.kind, ...(activity.detail ? { detail: activity.detail.slice(0, 120) } : {}) },
    });
    if (typeof r?.unread === 'number') {
      setSocialCounts({
        unread: r.unread,
        // Older servers only send the total
        unreadOther: typeof r.unreadOther === 'number' ? r.unreadOther : r.unread,
        ...(typeof r.requests === 'number' ? { requests: r.requests } : {}),
      });
    }
    if (r && r.staffRole !== undefined) await updateSessionUser({ ...session.user, staffRole: r.staffRole });
  } catch {
    /* offline: try again on the next beat */
  }
}

/** What you're doing right now (shown to friends). Sent immediately. */
export function setActivity(kind: Activity['kind'], detail?: string) {
  activity = { kind, detail };
  void beat();
}

/** Starts the heartbeat (call once at app start). */
export function startPresence() {
  if (started) return;
  started = true;
  timer = setInterval(() => void beat(), HEARTBEAT_MS);
  AppState.addEventListener('change', (s) => {
    if (s === 'active') void beat();
  });
  onSessionChange((s) => {
    if (s) void beat();
    else clearPersonalCounts(); // signed out: no requests / notices to show
  });
  void beat();
}

export function stopPresence() {
  if (timer) clearInterval(timer);
  timer = null;
  started = false;
}

/** "Playing Ode to Joy", "Online", "Seen 5m ago" … */
export function presenceText(p: Presence | null | undefined): string {
  if (!p) return '';
  if (p.online) {
    if (p.activity === 'playing') return p.detail ? `Playing ${p.detail}` : 'Playing';
    if (p.activity === 'editing') return p.detail ? `Editing ${p.detail}` : 'In the editor';
    return 'Online';
  }
  if (!p.lastSeenAt) return 'Offline';
  const s = (Date.now() - p.lastSeenAt) / 1000;
  if (s < 3600) return `Seen ${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86400) return `Seen ${Math.floor(s / 3600)}h ago`;
  return `Seen ${Math.floor(s / 86400)}d ago`;
}
