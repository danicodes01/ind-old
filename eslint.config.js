const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const eslintPluginPrettierRecommended = require('eslint-plugin-prettier/recommended');

/**
 * Packages `src/domain` may never import. See ADR-015 in docs/DECISIONS.md.
 * Domain code is plain TypeScript that would run unchanged in Node or a browser.
 */
const DOMAIN_FORBIDDEN_PACKAGES = [
  'react',
  'react/*',
  'react-dom',
  'react-dom/*',
  'react-native',
  'react-native/*',
  'react-native-*',
  'expo',
  'expo-*',
  '@expo/*',
  'drizzle-orm',
  'drizzle-orm/*',
  'drizzle-kit',
  '@supabase/*',
  'zustand',
];

/** Layers `src/domain` may never import. Dependencies point downward, never upward. */
const DOMAIN_FORBIDDEN_LAYERS = [
  '@/app',
  '@/app/**',
  '@/features',
  '@/features/**',
  '@/data',
  '@/data/**',
  '@/ui',
  '@/ui/**',
  '@/theme',
  '@/theme/**',
  '@/lib',
  '@/lib/**',
  '**/data/**',
  '**/features/**',
  '**/ui/**',
  '**/theme/**',
];

module.exports = defineConfig([
  expoConfig,
  eslintPluginPrettierRecommended,

  {
    ignores: ['dist/*', '.expo/*', 'src/data/db/migrations/*', 'expo-env.d.ts'],
  },

  /**
   * ADR-010 — Supabase containment.
   * The remote is reached through AuthPort / SyncTransport only. Nothing outside the
   * adapter may know which vendor is behind the port.
   */
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/data/sync/adapters/supabase/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@supabase', '@supabase/**'],
              message:
                'ADR-010: @supabase/* may only be imported inside src/data/sync/adapters/supabase/. Depend on AuthPort / SyncTransport instead.',
            },
          ],
        },
      ],
    },
  },

  /**
   * ADR-015 — domain purity.
   * Declared last so it wins for files under src/domain, and so its package list
   * (which includes @supabase) supersedes the containment block above.
   */
  {
    files: ['src/domain/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: DOMAIN_FORBIDDEN_PACKAGES,
              message:
                'ADR-015: src/domain must stay pure TypeScript — no React, React Native, Expo, Drizzle, or Supabase. Move anything needing I/O into src/data.',
            },
            {
              group: DOMAIN_FORBIDDEN_LAYERS,
              message:
                'ADR-015: src/domain may not import from other layers. Dependencies point downward. Take primitives as arguments and return values.',
            },
          ],
        },
      ],
    },
  },
]);
