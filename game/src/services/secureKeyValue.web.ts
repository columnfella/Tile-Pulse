/**
 * Small secrets on the device (session token, device id), web version.
 * Browsers have no keystore, so this uses localStorage (per site, never sent
 * anywhere by itself). Storage can be blocked (private mode): then values only
 * last until the page is reloaded.
 */
const memory = new Map<string, string>();

export const secureKeyValue = {
  async get(key: string): Promise<string | null> {
    try {
      return localStorage.getItem(key) ?? memory.get(key) ?? null;
    } catch {
      return memory.get(key) ?? null;
    }
  },
  async set(key: string, value: string): Promise<void> {
    memory.set(key, value);
    try {
      localStorage.setItem(key, value);
    } catch {
      /* blocked: kept in memory only */
    }
  },
  async remove(key: string): Promise<void> {
    memory.delete(key);
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};
