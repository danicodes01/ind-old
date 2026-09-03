const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Drizzle migrations are .sql files resolved through the bundler.
config.resolver.sourceExts.push('sql');

module.exports = config;
