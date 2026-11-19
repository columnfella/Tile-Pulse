#!/usr/bin/env node
/**
 * Copies the game's version (game/app.json) into the website before every
 * build / dev start, as src/content/game-version.json. The website only reads
 * that small file, so Next.js never has to look outside website/ (widening
 * its workspace root would make it watch the whole game folder).
 *
 * Runs automatically: "predev" and "prebuild" in package.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const appJson = path.join(here, '..', '..', 'game', 'app.json');
const out = path.join(here, '..', 'src', 'content', 'game-version.json');

let version = null;
try {
  version = JSON.parse(fs.readFileSync(appJson, 'utf8'))?.expo?.version ?? null;
} catch {
  // Website deployed without the game folder next to it: no version shown
}
fs.writeFileSync(out, JSON.stringify({ version }, null, 2) + '\n');
console.log(`game version for the website: ${version ?? '(unknown)'}`);
