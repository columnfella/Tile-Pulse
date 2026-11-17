/**
 * Friends (added by @username), presence (what you're doing, sent to the
 * server every minute while the app is open) and the leaderboard.
 */
import { AppState } from 'react-native';
import { apiRequest, getSession, onSessionChange } from './account';
import type { ImageRef, Presence } from './profile';

export interface PlayerCard {
  id: string;
  username: string;
  displayName: string;
  avatar: ImageRef | null;
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

export const getFriends = () => apiRequest<FriendLists>('GET', '/friends');

export const addFriend = (username: string) =>
  apiRequest<FriendLists & { status: 'friends' | 'outgoing' }>('POST', '/friends', {
    json: { username: username.trim().replace(/^@/, '') },
  });

export const acceptFriend = (userId: string) => apiRequest<FriendLists>('POST', `/friends/${userId}/accept`);

/** Removes a friend, declines their request, or cancels yours. */
export const removeFriend = (userId: string) => apiRequest<FriendLists>('DELETE', `/friends/${userId}`);

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
  if (AppState.currentState !== 'active' || !(await getSession())) return;
  try {
    await apiRequest('POST', '/me/presence', {
      json: { kind: activity.kind, ...(activity.detail ? { detail: activity.detail.slice(0, 120) } : {}) },
    });
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
