// Metro (Expo bundler) config for the game app (phone + web). The server,
// website and admin console live outside this folder, so nothing to block.
const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);
