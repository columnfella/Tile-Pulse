/**
 * Level likes / dislikes, star difficulty votes, comments, and the copy check (free / password /
 * not allowed) done before a downloaded level is copied into the editor.
 */
import { ApiError, apiRequest } from './account';
import type { ImageRef } from './profile';

export type Vote = 1 | -1 | 0;

/** 1 (easiest) … 8 (hardest) stars. */
export const MAX_STARS = 8;

export interface DifficultyVotes {
  /** Official community difficulty: set once `votes` reaches `threshold` (the majority wins). */
  stars: number | null;
  /** Most-voted star count so far. */
  leading: number | null;
  votes: number;
  threshold: number;
}

export interface SocialState {
  likes: number;
  dislikes: number;
  /** likes − dislikes (can be negative) */
  score: number;
  comments: number;
  /** Verified by a moderator (only verified levels count for the leaderboard). */
  verified?: boolean;
  /** Star difficulty from player votes (1–8). */
  difficulty: DifficultyVotes & { distribution: number[] };
  myVote: Vote;
  myRating: number | null;
  /** You finished the level, so you may rate it. */
  canRate: boolean;
}

export interface LevelComment {
  id: string;
  body: string;
  createdAt: number;
  author: { id: string; username: string; displayName: string; avatar: ImageRef | null; badge?: string | null };
  canDelete: boolean;
  /** You're a moderator and this is someone else's comment: remove it with a reason. */
  canModerate?: boolean;
  likes: number;
  dislikes: number;
  score: number;
  myVote: Vote;
}

export const getSocial = (levelId: string) => apiRequest<SocialState>('GET', `/levels/${levelId}/social`);

/** Like (1), dislike (-1) or clear (0) your vote on a level. */
export const voteLevel = (levelId: string, value: Vote) =>
  apiRequest<SocialState>('PUT', `/levels/${levelId}/vote`, { json: { value } });

export const voteComment = (commentId: string, value: Vote) =>
  apiRequest<{ likes: number; dislikes: number; score: number; myVote: Vote }>('PUT', `/comments/${commentId}/vote`, {
    json: { value },
  });

export const rateLevel = (levelId: string, stars: number | null) =>
  stars === null
    ? apiRequest<SocialState>('DELETE', `/levels/${levelId}/rating`)
    : apiRequest<SocialState>('PUT', `/levels/${levelId}/rating`, { json: { stars } });

export const getComments = (levelId: string, before?: string) =>
  apiRequest<{ comments: LevelComment[]; nextBefore: string | null }>(
    'GET',
    `/levels/${levelId}/comments${before ? `?before=${encodeURIComponent(before)}` : ''}`
  );

export const postComment = (levelId: string, body: string) =>
  apiRequest<SocialState & { id: string }>('POST', `/levels/${levelId}/comments`, { json: { body } });

export const deleteComment = (commentId: string) => apiRequest<void>('DELETE', `/comments/${commentId}`);

export type CopyCheck = { ok: true } | { ok: false; needsPassword: boolean; message: string };

/** Asks the server whether this level may be copied (with the password, if one is needed). */
export async function checkCopy(levelId: string, password?: string): Promise<CopyCheck> {
  try {
    await apiRequest('POST', `/levels/${levelId}/copy`, { json: password ? { password } : {} });
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      return { ok: false, needsPassword: Boolean(err.details?.needsPassword), message: err.message };
    }
    throw err;
  }
}
