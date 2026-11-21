/**
 * Notification inbox: friend requests, warnings from moderators (with the
 * reason), levels verified / removed, comments removed, new badges.
 * The unread count arrives with the presence heartbeat (friends.ts) every
 * minute and is shared through a tiny store, so the tab badge updates live.
 */
import { apiRequest } from './account';
import { setSocialCounts, useSocialCounts } from './socialCounts';

export type NotificationKind =
  | 'friend_request'
  | 'friend_accepted'
  | 'warning'
  | 'level_verified'
  | 'level_unverified'
  | 'level_removed'
  | 'comment_removed'
  | 'badge_granted'
  | 'unbanned';

export interface AppNotification {
  id: number;
  kind: NotificationKind;
  title: string;
  body: string | null;
  data: { userId?: string; username?: string; displayName?: string; levelId?: string; badge?: string } | null;
  actor: { id: string; username: string; displayName: string } | null;
  createdAt: number;
  read: boolean;
}

/* ------------------------------ unread count store ----------------------------- */

/** The inbox's unread count (all kinds); badges live in socialCounts.ts. */
export function setUnreadCount(n: number) {
  setSocialCounts({ unread: n });
}

/** Live unread count (all kinds). */
export function useUnreadCount(): number {
  return useSocialCounts().unread;
}

/* ----------------------------------- requests ---------------------------------- */

export async function getNotifications(before?: number) {
  const r = await apiRequest<{ notifications: AppNotification[]; unread: number; nextBefore: number | null }>(
    'GET',
    `/notifications${before ? `?before=${before}` : ''}`
  );
  setUnreadCount(r.unread);
  return r;
}

export async function markAllRead() {
  const r = await apiRequest<{ unread: number }>('POST', '/notifications/read', { json: { all: true } });
  setUnreadCount(r.unread);
}

export async function deleteNotification(id: number) {
  const r = await apiRequest<{ unread: number }>('DELETE', `/notifications/${id}`);
  setUnreadCount(r.unread);
}

export async function refreshUnread() {
  try {
    const r = await apiRequest<{ unread: number }>('GET', '/notifications/unread');
    setUnreadCount(r.unread);
  } catch {
    /* offline / signed out */
  }
}
