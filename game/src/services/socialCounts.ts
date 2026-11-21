/**
 * Live counts behind the red badges of the Social tab:
 *  - requests:      friend requests waiting for your answer (FRIENDS section)
 *  - unread:        unread inbox notices (all kinds, INBOX section)
 *  - unreadOther:   unread notices except friend requests (those count as requests)
 *  - announcements: team announcements you haven't seen yet (INBOX section)
 *
 * Fed by the presence heartbeat (friends.ts, every minute), the inbox and
 * friends screens, and announcements.ts. The tab badge is
 * requests + unreadOther + announcements, so nothing is counted twice.
 */
import { useSyncExternalStore } from 'react';

export interface SocialCounts {
  requests: number;
  unread: number;
  unreadOther: number;
  announcements: number;
}

let counts: SocialCounts = { requests: 0, unread: 0, unreadOther: 0, announcements: 0 };
const listeners = new Set<() => void>();

export function setSocialCounts(changes: Partial<SocialCounts>) {
  const next = { ...counts, ...changes };
  for (const k of Object.keys(next) as (keyof SocialCounts)[]) next[k] = Math.max(0, Math.floor(next[k] || 0));
  // Only the total unread is known (inbox screens): the other kinds can't exceed it
  if (changes.unread !== undefined && changes.unreadOther === undefined) next.unreadOther = Math.min(next.unreadOther, next.unread);
  if (
    next.requests === counts.requests &&
    next.unread === counts.unread &&
    next.unreadOther === counts.unreadOther &&
    next.announcements === counts.announcements
  )
    return;
  counts = next;
  listeners.forEach((l) => l());
}

export const getSocialCounts = () => counts;

/** Signed out: nothing personal to count (announcements stay). */
export const clearPersonalCounts = () => setSocialCounts({ requests: 0, unread: 0, unreadOther: 0 });

export function useSocialCounts() {
  const c = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => counts,
    () => counts
  );
  return {
    ...c,
    /** Red badge on the Social tab. */
    tab: c.requests + c.unreadOther + c.announcements,
    /** FRIENDS section. */
    friends: c.requests,
    /** INBOX section. */
    inbox: c.unread + c.announcements,
  };
}

/** "3", or "99+" for large numbers. */
export const badgeText = (n: number) => (n > 99 ? '99+' : String(n));
