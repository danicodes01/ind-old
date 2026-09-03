module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Drizzle's generated migrations are .sql files imported directly by the migrator.
    plugins: [['inline-import', { extensions: ['.sql'] }]],
  };
};
