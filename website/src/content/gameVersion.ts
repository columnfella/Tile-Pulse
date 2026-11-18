import app from '../../../app.json';

/**
 * The game's current version, taken straight from the game's own app.json
 * (one folder up from the website). The commit hook bumps it on every commit,
 * so there is no copy to keep in sync. It's bundled when the site is built:
 * the exported site is plain static files and needs no server.
 */
export const gameVersion: string | null =
  typeof app?.expo?.version === 'string' && app.expo.version ? app.expo.version : null;
