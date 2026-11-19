import gameVersionFile from './game-version.json';

/**
 * The game's current version. scripts/game-version.mjs copies it from the
 * game's own app.json (game/app.json) before every build and dev start, and the
 * commit hook bumps it on every game commit, so there is no copy to keep in
 * sync by hand. The exported site is plain static files and needs no server.
 */
export const gameVersion: string | null =
  typeof gameVersionFile.version === 'string' && gameVersionFile.version ? gameVersionFile.version : null;
