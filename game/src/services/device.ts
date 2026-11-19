/**
 * A random id for this app install, sent to the server as X-Device-Id.
 *
 * The server uses it for abuse protection: misbehaving devices are banned
 * instead of whole IP addresses (which many people can share). It's created
 * once and kept in the phone's secure storage (Keychain / Keystore; browser
 * storage on web). It is random — not derived from the hardware — so it says
 * nothing about the phone itself. (Apps can't read a phone's MAC address.)
 */
// Platform files: secureKeyValue.ts (app keystore) / secureKeyValue.web.ts (browser storage)
import { secureKeyValue } from './secureKeyValue';

const KEY = 'tilepulse_device_id_v1';
const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

let cached: string | null = null;
let pending: Promise<string> | null = null;

function newId(): string {
  // 32 base62 characters (~190 bits). Prefer the platform's crypto random source.
  const bytes = new Uint8Array(32);
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  let out = 'tp_';
  for (const b of bytes) out += ALPHABET[b % 62];
  return out.slice(0, 35);
}

async function read(): Promise<string | null> {
  try {
    return await secureKeyValue.get(KEY);
  } catch {
    return null;
  }
}

async function write(id: string): Promise<void> {
  try {
    await secureKeyValue.set(KEY, id);
  } catch {
    /* storage unavailable: the id lasts until the app restarts */
  }
}

/** This install's device id (created on first use). */
export function getDeviceId(): Promise<string> {
  if (cached) return Promise.resolve(cached);
  pending ??= (async () => {
    const existing = await read();
    const id = existing && /^[A-Za-z0-9_-]{16,64}$/.test(existing) ? existing : newId();
    if (id !== existing) await write(id);
    cached = id;
    return id;
  })();
  return pending;
}
