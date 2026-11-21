/**
 * Player profile on the community server: your account (pictures, banner,
 * privacy, password, one-time username change), public profile pages, and
 * submitting scores so plays show up in your history.
 */
import { API_BASE } from './communityApi';
import { ApiError, apiRequest, getSession, updateSessionUser, type AccountUser } from './account';
import { putFile } from './binaryUpload';

export interface ImageRef {
  sha256: string;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
}

export interface Privacy {
  profile: boolean;
  history: boolean;
  uploads: boolean;
}

export interface MyProfile extends AccountUser {
  avatar: ImageRef | null;
  banner: ImageRef | null;
  bannerColor: string | null;
  canChangeUsername: boolean;
  privacy: Privacy;
  stats: { plays: number; uploads: number };
  role: 'player' | 'admin';
  badges: Badge[];
  createdAt: number;
}

export interface ProfileLevel {
  id: string;
  name: string;
  difficulty: 'easy' | 'normal' | 'hard' | 'expert';
  level: number;
  cover: ImageRef | null;
  song: { title: string; artist: string | null };
}

export interface ProfileUpload extends ProfileLevel {
  noteCount: number;
  plays: number;
  visibility?: 'private' | 'unlisted' | 'public';
  createdAt: number;
}

export interface HistoryEntry {
  level: ProfileLevel;
  score: number;
  accuracy: number;
  maxCombo: number;
  misses: number;
  hardcore: boolean;
  playedAt: number;
}

export interface PublicProfile {
  id: string;
  username: string;
  displayName: string;
  avatar: ImageRef | null;
  banner: ImageRef | null;
  bannerColor: string | null;
  staffRole?: 'moderator' | 'owner' | null;
  badges: Badge[];
  createdAt: number;
  private: boolean;
  self?: boolean;
  /** Your relation with this player (null on your own profile / signed out). */
  friend: FriendRelation | null;
  /** Only shown to friends. */
  presence: Presence | null;
  stats: { plays: number; uploads: number } | null;
  uploads: ProfileUpload[] | null;
  history: HistoryEntry[] | null;
}

export type FriendRelation = 'none' | 'friends' | 'outgoing' | 'incoming';

export interface Presence {
  online: boolean;
  activity: 'menu' | 'playing' | 'editing' | null;
  detail: string | null;
  lastSeenAt: number | null;
}

export const DEFAULT_BANNER_COLOR = '#2f6bff';

/** Picture URLs carry the content hash, so a new picture is never served from cache. */
export const avatarUrl = (userId: string, ref: ImageRef | null) =>
  ref ? `${API_BASE}/api/v1/users/${userId}/avatar?v=${ref.sha256.slice(0, 12)}` : null;
export const bannerUrl = (userId: string, ref: ImageRef | null) =>
  ref ? `${API_BASE}/api/v1/users/${userId}/banner?v=${ref.sha256.slice(0, 12)}` : null;
export const levelCoverUrl = (levelId: string, ref: ImageRef | null) =>
  ref ? `${API_BASE}/api/v1/levels/${levelId}/cover?v=${ref.sha256.slice(0, 12)}` : null;

async function withUser(p: Promise<{ user: MyProfile }>): Promise<MyProfile> {
  const { user } = await p;
  await updateSessionUser(user);
  return user;
}

export const getMyProfile = () => withUser(apiRequest('GET', '/me'));

export const updateMyProfile = (changes: {
  displayName?: string;
  bannerColor?: string | null;
  privacy?: Partial<Privacy>;
}) => withUser(apiRequest('PATCH', '/me', { json: changes }));

export const changeUsername = (username: string, password: string) =>
  withUser(apiRequest('POST', '/me/username', { json: { username, password } }));

export const changePassword = (currentPassword: string, newPassword: string) =>
  apiRequest<void>('POST', '/me/password', { json: { currentPassword, newPassword } });

/** Uploads a picked image file as your avatar or banner. */
export async function setProfileImage(kind: 'avatar' | 'banner', fileUri: string): Promise<MyProfile> {
  const session = await getSession();
  if (!session) throw new ApiError(401, 'Sign in first');
  const res = await putFile(`${API_BASE}/api/v1/me/${kind}`, fileUri, session.token);
  let body: { user?: MyProfile; error?: string } = {};
  try {
    body = JSON.parse(res.body);
  } catch {
    /* not JSON */
  }
  if (res.status === 413) throw new ApiError(413, 'That picture is too large. Try a smaller one.');
  if (res.status >= 400 || !body.user) throw new ApiError(res.status, body.error ?? `Upload failed (${res.status})`);
  return body.user;
}

export const removeProfileImage = (kind: 'avatar' | 'banner') => withUser(apiRequest('DELETE', `/me/${kind}`));

export async function getProfile(username: string): Promise<PublicProfile> {
  const { profile } = await apiRequest<{ profile: PublicProfile }>('GET', `/profiles/${encodeURIComponent(username)}`);
  return profile;
}

/**
 * Records a finished run of a community level (only when signed in; failures
 * are ignored). Resolves whether it earned leaderboard points (only verified
 * levels made by someone else do), or null when it wasn't sent.
 */
/**
 * A run of a community level starts: asks the server for a one-time play ticket.
 * Only scores sent with one count for leaderboards and play counts (the server
 * also checks the run took about as long as the song). null when signed out / offline.
 */
export async function startPlay(levelId: string): Promise<string | null> {
  if (!(await getSession())) return null;
  try {
    return (await apiRequest<{ playId: string }>('POST', `/beatmaps/${levelId}/plays`)).playId ?? null;
  } catch {
    return null;
  }
}

export async function submitScore(
  levelId: string,
  s: { score: number; accuracy: number; maxCombo: number; perfect: number; great: number; good: number; miss: number },
  hardcore: boolean,
  playId?: string | null
): Promise<{ ranked: boolean; verified: boolean } | null> {
  if (!(await getSession())) return null;
  try {
    const r = await apiRequest<{ ranked?: boolean; verified?: boolean }>('POST', `/beatmaps/${levelId}/scores`, {
      json: {
        ...s,
        accuracy: Math.max(0, Math.min(100, s.accuracy)),
        hardcore: hardcore && s.miss === 0,
        ...(playId ? { playId } : {}),
      },
    });
    return { ranked: Boolean(r?.ranked), verified: Boolean(r?.verified) };
  } catch {
    return null; // offline or level removed: the run still counts locally
  }
}
