/**
 * Player account for the community server: sign in / create account / sign out.
 *
 * The session token is kept in the OS keystore (expo-secure-store: Android
 * Keystore / iOS Keychain). The browser preview has no keystore, so it falls
 * back to localStorage there. Passwords are never stored on the device.
 */
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { API_BASE, ApiUnavailableError } from './communityApi';

const SESSION_KEY = 'tilepulse_session_v1';
const REQUEST_TIMEOUT_MS = 15_000;

export interface AccountUser {
  id: string;
  username: string;
  displayName: string;
}

export interface Session {
  token: string;
  expiresAt: number;
  user: AccountUser;
}

/* ------------------------------ token storage ----------------------------- */

const store = {
  async get(): Promise<string | null> {
    if (Platform.OS === 'web') {
      try {
        return localStorage.getItem(SESSION_KEY);
      } catch {
        return null;
      }
    }
    return SecureStore.getItemAsync(SESSION_KEY);
  },
  async set(value: string): Promise<void> {
    if (Platform.OS === 'web') {
      try {
        localStorage.setItem(SESSION_KEY, value);
      } catch {
        /* storage blocked: session lasts until reload */
      }
      return;
    }
    await SecureStore.setItemAsync(SESSION_KEY, value);
  },
  async remove(): Promise<void> {
    if (Platform.OS === 'web') {
      try {
        localStorage.removeItem(SESSION_KEY);
      } catch {
        /* ignore */
      }
      return;
    }
    await SecureStore.deleteItemAsync(SESSION_KEY);
  },
};

let cached: Session | null | undefined;
const sessionListeners = new Set<(s: Session | null) => void>();

/** Called whenever you sign in, sign out, or your account details change. */
export function onSessionChange(listener: (s: Session | null) => void): () => void {
  sessionListeners.add(listener);
  return () => {
    sessionListeners.delete(listener);
  };
}

export async function getSession(): Promise<Session | null> {
  if (cached !== undefined) return cached;
  try {
    const raw = await store.get();
    const parsed = raw ? (JSON.parse(raw) as Session) : null;
    cached = parsed && parsed.expiresAt > Date.now() ? parsed : null;
  } catch {
    cached = null;
  }
  return cached;
}

async function saveSession(session: Session | null) {
  cached = session;
  if (session) await store.set(JSON.stringify(session));
  else await store.remove();
  sessionListeners.forEach((l) => l(session));
}

/** Keeps the stored session's name in sync after a profile change. */
export async function updateSessionUser(user: AccountUser): Promise<void> {
  const s = await getSession();
  if (s) await saveSession({ ...s, user: { id: user.id, username: user.username, displayName: user.displayName } });
}

/* --------------------------------- requests -------------------------------- */

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
  }
}

/** JSON request to the API, with the session token when signed in. */
export async function apiRequest<T>(
  method: string,
  path: string,
  { json, auth = true }: { json?: unknown; auth?: boolean } = {}
): Promise<T> {
  const session = auth ? await getSession() : null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/v1${path}`, {
      method,
      signal: controller.signal,
      // Always fresh: a cached /me would show settings from before a change
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
      },
      body: json !== undefined ? JSON.stringify(json) : undefined,
    });
  } catch {
    throw new ApiUnavailableError();
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text().catch(() => '');
  let body: any = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = {}; // not JSON (e.g. a proxy error page)
  }
  if (!res.ok) {
    // An expired / revoked session: forget it so the UI asks to sign in again.
    // (Other 401s, like a wrong current password, must not sign you out.)
    if (res.status === 401 && session && /session|authentication required/i.test(String(body?.error ?? ''))) {
      await saveSession(null);
    }
    if (res.status === 429 && typeof body?.error !== 'string') {
      throw new ApiError(429, 'Too many requests. Wait a few seconds and try again.');
    }
    // Validation errors list the first problem, e.g. "password: Too small"
    const first = Array.isArray(body?.issues) ? body.issues[0] : null;
    const issue = first ? `${first.path ? `${first.path}: ` : ''}${first.message}` : null;
    const fallback = res.status >= 500 ? 'The server had a problem. Try again in a moment.' : `Request failed (${res.status})`;
    throw new ApiError(res.status, issue || (typeof body?.error === 'string' ? body.error : fallback), body?.details);
  }
  return body as T;
}

/* --------------------------------- account -------------------------------- */

type AuthResponse = { user: AccountUser; token: string; expiresAt: number };

const toSession = (r: AuthResponse): Session => ({
  token: r.token,
  expiresAt: r.expiresAt,
  user: { id: r.user.id, username: r.user.username, displayName: r.user.displayName },
});

export async function signIn(username: string, password: string): Promise<Session> {
  const r = await apiRequest<AuthResponse>('POST', '/auth/login', { json: { username, password }, auth: false });
  const session = toSession(r);
  await saveSession(session);
  return session;
}

export async function register(username: string, displayName: string, password: string): Promise<Session> {
  const r = await apiRequest<AuthResponse>('POST', '/auth/register', {
    json: { username, displayName, password },
    auth: false,
  });
  const session = toSession(r);
  await saveSession(session);
  return session;
}

export async function signOut(): Promise<void> {
  try {
    if (await getSession()) await apiRequest('POST', '/auth/logout');
  } catch {
    /* offline: still forget the token locally */
  }
  await saveSession(null);
}
