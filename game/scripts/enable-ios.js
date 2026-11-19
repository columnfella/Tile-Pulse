#!/usr/bin/env node
/**
 * Switches on the iOS settings the App Store / TestFlight build needs.
 * Run once, when you have an Apple Developer account (see docs/ios-setup.md):
 *
 *   node scripts/enable-ios.js
 *
 * Why it isn't switched on already: every setting in app.json (even iOS-only
 * ones) is part of the Android runtime fingerprint, so adding them early would
 * cut the installed Android test builds off from OTA updates for nothing.
 * Running this changes the fingerprint once: the APK workflow then builds a
 * new APK automatically and the website links it.
 */
const fs = require('fs');
const path = require('path');

const APP_JSON = path.join(__dirname, '..', 'app.json');

const IOS_SETTINGS = {
  supportsTablet: false,
  bundleIdentifier: 'com.tilepulse.rhythm',
  // No alpha channel: Apple rejects App Store icons with transparency
  icon: './src/assets/images/icon-ios.png',
  // The app only uses standard HTTPS: skips the export-compliance question on every upload
  config: { usesNonExemptEncryption: false },
  // The reasons Apple shows when the app asks for access (reviewers read these)
  infoPlist: {
    NSPhotoLibraryUsageDescription:
      'TilePulse uses your photos only when you pick a cover picture for a level, or an avatar or banner for your profile.',
    NSAppleMusicUsageDescription: 'TilePulse uses your music library only when you pick a song to turn into a level.',
    NSMicrophoneUsageDescription:
      'TilePulse does not record audio. This permission is only listed because an audio library requires it.',
  },
};

const raw = fs.readFileSync(APP_JSON, 'utf8');
const json = JSON.parse(raw);
const before = JSON.stringify(json.expo.ios ?? {});
json.expo.ios = { ...(json.expo.ios ?? {}), ...IOS_SETTINGS };
if (JSON.stringify(json.expo.ios) === before) {
  console.log('iOS settings are already on. Nothing to change.');
  process.exit(0);
}
fs.writeFileSync(APP_JSON, JSON.stringify(json, null, 2) + '\n');
console.log(`iOS settings added to app.json:
  bundle id   ${IOS_SETTINGS.bundleIdentifier}
  icon        ${IOS_SETTINGS.icon} (no transparency)
  permissions photo library, music library (with reasons)

Next (see docs/ios-setup.md):
  1. Commit and push (the APK workflow rebuilds the Android test build automatically).
  2. npx eas-cli build -p ios --profile testflight
  3. npx eas-cli submit -p ios --profile testflight --latest`);
