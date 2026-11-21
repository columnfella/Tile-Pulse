/**
 * Your own profile picture, for the profile button on the Songs tab.
 *
 * A tiny shared store: the Profile screen updates it whenever your profile
 * loads or changes, and the button loads it once itself if the Profile screen
 * hasn't been opened yet. Cleared on sign-out.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { getSession, onSessionChange } from './account';
import { avatarUrl, getMyProfile, type MyProfile } from './profile';

interface MyAvatar {
  /** Signed in at all (false: show the generic account icon). */
  signedIn: boolean;
  /** Picture URL, or null when you have none (show your initial). */
  uri: string | null;
  initial: string;
}

let state: MyAvatar = { signedIn: false, uri: null, initial: '?' };
let loadedFor: string | null = null; // token the picture was loaded for
const listeners = new Set<() => void>();

function set(next: MyAvatar) {
  state = next;
  listeners.forEach((l) => l());
}

/** Called by the Profile screen with your freshly loaded / edited profile. */
export function publishMyProfile(me: MyProfile) {
  set({ signedIn: true, uri: avatarUrl(me.id, me.avatar), initial: (me.displayName[0] ?? '?').toUpperCase() });
}

async function refresh() {
  const session = await getSession();
  if (!session) {
    loadedFor = null;
    set({ signedIn: false, uri: null, initial: '?' });
    return;
  }
  if (loadedFor === session.token && state.signedIn) return;
  // Show the initial right away; the picture follows
  if (!state.signedIn) set({ signedIn: true, uri: null, initial: (session.user.displayName[0] ?? '?').toUpperCase() });
  try {
    publishMyProfile(await getMyProfile());
    loadedFor = session.token;
  } catch {
    /* offline: keep the initial */
  }
}

onSessionChange(() => {
  loadedFor = null;
  void refresh();
});

/** Your avatar for the profile button (loads it on first use). */
export function useMyAvatar(): MyAvatar {
  useEffect(() => {
    void refresh();
  }, []);
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state
  );
}
