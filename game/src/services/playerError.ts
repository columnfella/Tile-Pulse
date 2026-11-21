/**
 * Turns any error into a short message a player can act on.
 *
 * Players never see technical details: no server address, status codes, stack
 * traces or library messages ("Network request failed", "TypeError: …").
 * Only messages the server wrote for players (e.g. "Wrong username or
 * password", "That username is taken") are shown as they are.
 * In development builds the original error is still logged to the console.
 */
import { ApiError } from './account';
import { ApiRequestError, ApiUnavailableError } from './communityApi';

export const OFFLINE_MESSAGE = 'Can’t connect right now. Check your internet connection and try again.';
const SERVER_MESSAGE = 'Something went wrong on our side. Please try again in a moment.';
const GENERIC_MESSAGE = 'Something went wrong. Please try again.';

export function playerErrorMessage(err: unknown, fallback: string = GENERIC_MESSAGE): string {
  if (__DEV__) console.warn('[TilePulse] error:', err);
  if (err instanceof ApiUnavailableError) return OFFLINE_MESSAGE;
  if (err instanceof ApiError || err instanceof ApiRequestError) {
    if (err.status === 0) return OFFLINE_MESSAGE; // couldn't make a safe connection
    if (err.status >= 500) return SERVER_MESSAGE;
    const msg = err.message?.trim();
    // Generic fallbacks ("Request failed (404)") aren't for players
    if (!msg || /^request failed/i.test(msg)) return fallback;
    return msg;
  }
  // Anything else is an app / library error: never shown as-is
  return fallback;
}
