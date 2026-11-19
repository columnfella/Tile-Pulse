# Putting TilePulse on iPhones (TestFlight → App Store)

Everything on the app side is prepared. What's left needs an **Apple Developer
Program** membership ($99 / year, developer.apple.com/programs). No Mac is
needed: Expo builds and signs the app on its servers.

Until then, iPhone players can use the **web version** (open it in Safari →
Share → *Add to Home Screen*).

## Once you have the Apple account

All commands below run inside the `game/` folder (`cd game`).

1. **Switch the iOS settings on** (bundle id, icon without transparency,
   permission texts):

   ```sh
   node scripts/enable-ios.js
   ```

   Commit and push. This changes the app's runtime fingerprint once, so the
   *APK build + website link* workflow builds a new Android APK by itself and
   the website starts linking it (testers reinstall once).

2. **Build for TestFlight.** The first time, EAS asks you to sign in to Apple
   and creates the certificates for you. Type your Apple details into EAS,
   never into a chat:

   ```sh
   npx eas-cli build -p ios --profile testflight
   ```

3. **Upload to App Store Connect / TestFlight:**

   ```sh
   npx eas-cli submit -p ios --profile testflight --latest
   ```

   EAS creates the app in App Store Connect if it doesn't exist yet. The name
   "TilePulse" must be free there.

4. **In App Store Connect → TestFlight:** add a test group, turn on the
   **public link**, and fill in the short beta description. The first build
   for outside testers gets a light Beta App Review (usually about a day).

5. **Website:** add the TestFlight public link next to *Download APK*.

## Things already in place

- `eas.json` has a `testflight` build profile (App Store distribution, the same
  `preview` update channel as the Android test build, build number bumped
  automatically) and a `testflight` submit profile.
- OTA updates: `.github/workflows/eas-update.yml` already publishes an iOS
  update on every push, so the TestFlight build gets fixes without a rebuild.
- The app talks only to the HTTPS server, so no App Transport Security
  exceptions are needed.
- `scripts/generate-app-icons.js` writes `src/assets/images/icon-ios.png`.

## Licences to keep in mind

The menu song is **CC BY-NC 3.0** (non-commercial). A free app is fine; ads or
paid features would need another track or the artist's permission.
