// Metro config: Expo's defaults, plus the .wasm asset that expo-sqlite's web
// build loads (web preview, `npm run web`). Native builds are unaffected.
// The app only uses SQLite's async API, which works without the
// cross-origin isolation headers its synchronous web API would need.
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

if (!config.resolver.assetExts.includes("wasm")) {
  config.resolver.assetExts.push("wasm");
}

module.exports = config;
