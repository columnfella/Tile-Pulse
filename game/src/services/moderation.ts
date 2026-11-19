/**
 * Moderator actions (moderators and the owner only — the server checks):
 * verify levels, remove levels / comments with a reason, warn / ban players.
 */
import { apiRequest } from './account';

export const verifyLevel = (levelId: string) => apiRequest<{ verified: boolean }>('POST', `/mod/levels/${levelId}/verify`);

export const unverifyLevel = (levelId: string, reason?: string) =>
  apiRequest<{ verified: boolean }>('POST', `/mod/levels/${levelId}/unverify`, { json: reason ? { reason } : {} });

export const removeLevel = (levelId: string, reason: string) =>
  apiRequest<void>('POST', `/mod/levels/${levelId}/delete`, { json: { reason } });

export const removeComment = (commentId: string, reason: string) =>
  apiRequest<void>('POST', `/mod/comments/${commentId}/delete`, { json: { reason } });

export interface ModUserSummary {
  id: string;
  username: string;
  displayName: string;
  staffRole: 'moderator' | 'owner' | null;
  /** The owner and admins can't be warned or banned. */
  protected: boolean;
  bannedAt: number | null;
  banReason: string | null;
  createdAt: number;
  levels: number;
  warningCount: number;
  warnings: { reason: string; at: number; by: string | null }[];
}

export async function getModUser(username: string) {
  const { user } = await apiRequest<{ user: ModUserSummary }>('GET', `/mod/users/${encodeURIComponent(username)}`);
  return user;
}

export const warnUser = (username: string, reason: string) =>
  apiRequest<{ warningCount: number }>('POST', `/mod/users/${encodeURIComponent(username)}/warn`, { json: { reason } });

export const banUser = (username: string, reason: string) =>
  apiRequest<{ banned: boolean }>('POST', `/mod/users/${encodeURIComponent(username)}/ban`, { json: { reason } });

export const unbanUser = (username: string) =>
  apiRequest<{ banned: boolean }>('POST', `/mod/users/${encodeURIComponent(username)}/unban`);
