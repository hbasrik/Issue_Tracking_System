const fs = require('fs');
const path = require('path');

// Shared .env lives at the repository root, not in mobile/. Without this,
// EXPO_PUBLIC_API_BASE_URL in .env would never reach process.env and
// client.ts would silently use its fallback (same class of bug as Vite envDir).
const repoEnvPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(repoEnvPath)) {
  for (const line of fs.readFileSync(repoEnvPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

module.exports = function (api) {
  api.cache.using(() => process.env.EXPO_PUBLIC_API_BASE_URL || '');
  return {
    presets: ['babel-preset-expo'],
    // Do NOT add react-native-reanimated/plugin (or react-native-worklets/plugin)
    // here. babel-preset-expo already injects react-native-worklets/plugin when
    // those packages are installed (Expo SDK 54). A second manual entry
    // double-applies the transform and surfaces WorkletsError: Failed to
    // create a worklet at app startup.
  };
};

