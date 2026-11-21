/**
 * Keeps downloaded community levels up to date: when the creator updates a
 * level you downloaded, the new version (notes, settings, cover, and the audio
 * only if it changed) is downloaded automatically. Checked when the Songs tab
 * opens, at most every few minutes; failures are silent (tried again later).
 */
import type { Song } from '../types/song';
import { downloadLevel, getLevelVersions } from './communityApi';
import { storageService } from './storage';

const CHECK_EVERY_MS = 5 * 60_000;
let lastCheck = 0;
let running: Promise<string[]> | null = null;

/** Updates the downloaded levels that changed online. Returns the updated levels' names. */
export function updateDownloadedLevels(force = false): Promise<string[]> {
  if (running) return running;
  if (!force && Date.now() - lastCheck < CHECK_EVERY_MS) return Promise.resolve([]);
  lastCheck = Date.now();
  running = (async () => {
    const updated: string[] = [];
    try {
      const downloaded = (await storageService.getSongs()).filter((s): s is Song & { community: NonNullable<Song['community']> } => !!s.community);
      if (!downloaded.length) return updated;
      const online = new Map((await getLevelVersions(downloaded.map((s) => s.community.levelId))).map((l) => [l.id, l]));
      for (const song of downloaded) {
        const remote = online.get(song.community.levelId);
        if (!remote) continue; // deleted / private online: keep the copy you have
        // Older downloads don't know their version: compare with when they were downloaded
        const isNewer =
          song.community.version !== undefined ? remote.version > song.community.version : remote.updatedAt > song.createdAt;
        if (!isNewer) continue;
        try {
          const fresh = await downloadLevel({ id: remote.id });
          updated.push(fresh.community?.name ?? fresh.title);
        } catch {
          /* try again next time */
        }
      }
    } catch {
      /* offline */
    } finally {
      running = null;
    }
    return updated;
  })();
  return running;
}
