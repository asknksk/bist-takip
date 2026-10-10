const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-sqlite web worker imports wa-sqlite.wasm as an asset.
config.resolver.assetExts.push('wasm');

// SharedArrayBuffer (used by wa-sqlite) requires cross-origin isolation.
config.server = {
  ...config.server,
  headers: {
    'Cross-Origin-Embedder-Policy': 'credentialless',
    'Cross-Origin-Opener-Policy': 'same-origin',
  },
};

module.exports = config;
