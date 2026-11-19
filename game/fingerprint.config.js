/**
 * EAS Update runtime fingerprint settings.
 *
 * - ExpoConfigVersions: the post-commit hook bumps "version" in app.json on every
 *   commit. Leaving the version fields out keeps the runtime version stable, so
 *   OTA updates keep reaching installed builds.
 * - PackageJsonScriptsAll: `expo prebuild` on EAS rewrites the "android"/"ios"
 *   scripts in package.json, which would make the build's fingerprint differ
 *   from the one computed locally / in CI (and fail the build).
 *
 * - GitIgnore / Easignore / EasJson: they don't affect native code, and their line
 *   endings differ between a Windows checkout (CRLF) and CI (LF), which made the
 *   APK's runtime differ from the one CI publishes updates for.
 * - GitIgnore / Easignore / EasJson: they don't affect native code, and their line
 *   endings differ between a Windows checkout (CRLF) and CI (LF), which made the
 *   APK's runtime differ from the one CI publishes updates for.
 *
 * The runtime only changes when native code / native dependencies change
 * (which needs a new APK anyway).
 */
module.exports = {
  sourceSkips: ['ExpoConfigVersions', 'PackageJsonScriptsAll', 'GitIgnore', 'Easignore', 'EasJson'],
};
