#!/usr/bin/env node
/**
 * Keeps the website's "Download APK" button pointing at the newest Android
 * test build, with its real file size. Run by .github/workflows/apk-build.yml
 * (needs the `eas` CLI signed in through EXPO_TOKEN); can also run locally.
 *
 *   node scripts/sync-apk-build.mjs              ensure a build exists for the current
 *                                                native code, then sync the website file
 *   node scripts/sync-apk-build.mjs --sync-only  only sync the website file
 *
 * 1. A new APK is only needed when native code changes (the runtime
 *    fingerprint): everything else reaches installed apps as OTA updates. If no
 *    build exists for the current fingerprint — or the newest one expires
 *    within 3 days (the free plan deletes builds after ~2 weeks) — a build is
 *    started (without waiting for it).
 * 2. The newest finished build's public APK link + file size are written to
 *    website/src/content/latest-build.json. Prints "changed=true|false" to
 *    $GITHUB_OUTPUT so the workflow knows whether to commit.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'website', 'src', 'content', 'latest-build.json');
const PROFILE = 'preview';
const EXPIRY_MARGIN_MS = 3 * 24 * 3600 * 1000;
const syncOnly = process.argv.includes('--sync-only');
const EAS = process.env.EAS_BIN || (process.env.CI ? 'eas' : 'npx eas-cli');

const run = (cmd) => execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
/** First JSON value in a command's output (CLIs sometimes print a line before it). */
const json = (text) => JSON.parse(text.slice(Math.min(...['[', '{'].map((c) => text.indexOf(c)).filter((i) => i >= 0))));
const setOutput = (key, value) => {
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
  console.log(`${key}=${value}`);
};

const runtimeOf = (b) => b.runtime?.version ?? b.runtimeVersion ?? null;
const builds = json(run(`${EAS} build:list --platform android --limit 25 --json --non-interactive`))
  .filter((b) => b.buildProfile === PROFILE)
  .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

/* ---------------------------- 1. build if needed ---------------------------- */

if (!syncOnly) {
  const fingerprint = json(run('npx expo-updates fingerprint:generate --platform android')).hash;
  const forThis = builds.filter((b) => runtimeOf(b) === fingerprint);
  const running = forThis.find((b) => ['NEW', 'IN_QUEUE', 'IN_PROGRESS'].includes(b.status));
  const finished = forThis.find((b) => b.status === 'FINISHED');
  const expiring = finished && new Date(finished.expirationDate).getTime() - Date.now() < EXPIRY_MARGIN_MS;
  console.log(`fingerprint ${fingerprint}: ${finished ? `built (${finished.id})` : 'no build yet'}${running ? `, building now (${running.id})` : ''}${expiring ? ', expiring soon' : ''}`);
  if (!running && (!finished || expiring)) {
    console.log('Starting a new Android build…');
    console.log(run(`${EAS} build --platform android --profile ${PROFILE} --non-interactive --no-wait`).trim().split('\n').slice(-2).join('\n'));
    setOutput('build_started', 'true');
  }
}

/* ---------------------------- 2. sync the website --------------------------- */

const latest = builds.find((b) => b.status === 'FINISHED' && b.artifacts?.buildUrl && new Date(b.expirationDate) > new Date());
if (!latest) {
  console.log('No finished, unexpired build yet: website file left as it is.');
  setOutput('changed', 'false');
  process.exit(0);
}

const current = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
let sizeBytes = current.id === latest.id ? current.sizeBytes : null;
if (!sizeBytes) {
  // The real size of the file people download (follows Expo's redirect to storage)
  const res = await fetch(latest.artifacts.buildUrl, { method: 'HEAD', redirect: 'follow' });
  sizeBytes = Number(res.headers.get('content-length')) || null;
  if (!res.ok || !sizeBytes) throw new Error(`Could not read the APK size (HTTP ${res.status})`);
}

const next = {
  id: latest.id,
  apkUrl: latest.artifacts.buildUrl,
  sizeBytes,
  appVersion: latest.appVersion ?? null,
  runtimeVersion: runtimeOf(latest),
  builtAt: latest.completedAt ?? latest.updatedAt ?? null,
  expiresAt: latest.expirationDate ?? null,
};
const changed = JSON.stringify(next) !== JSON.stringify(current);
if (changed) {
  fs.writeFileSync(OUT, JSON.stringify(next, null, 2) + '\n');
  console.log(`Website now links build ${next.id} (${(sizeBytes / 1048576).toFixed(1)} MB, v${next.appVersion}).`);
} else {
  console.log(`Website already links the newest build (${next.id}).`);
}
setOutput('changed', String(changed));
