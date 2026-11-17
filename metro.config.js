// Metro (Expo bundler) config: keep the Node backend and the Next.js website out of the app bundle and file watcher.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const existing = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(existing) ? existing : existing ? [existing] : []),
  /[\\/]backend[\\/].*/,
  /[\\/]website[\\/].*/,
];

module.exports = config;
