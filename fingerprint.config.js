/**
 * EAS Update runtime fingerprint settings.
 *
 * The post-commit hook bumps "version" in app.json on every commit. Leaving the
 * version fields out of the fingerprint keeps the runtime version stable, so OTA
 * updates keep reaching installed builds. The runtime only changes when native
 * code / native dependencies change (which needs a new APK anyway).
 */
module.exports = {
  sourceSkips: ['ExpoConfigVersions'],
};
