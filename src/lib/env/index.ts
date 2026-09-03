/**
 * Typed, validated access to build-time configuration.
 *
 * Expo inlines only `EXPO_PUBLIC_`-prefixed variables, and only when referenced with static
 * dot notation — `process.env.EXPO_PUBLIC_X` is replaced at build time, `process.env['...']`
 * is not. Every read below is therefore written out literally on purpose; do not refactor
 * them into a loop or a dynamic lookup.
 *
 * Everything here ships in the bundle in plain text and must be treated as public. The
 * Supabase anon key qualifies: it is designed to be published, and row-level security, not
 * secrecy, is what protects the data.
 */

const rawSupabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const rawSupabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export interface SupabaseConfig {
  readonly url: string;
  readonly anonKey: string;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

function present(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Supabase configuration, or `null` when this build has none.
 *
 * Absent configuration is a legitimate state, not a failure: local-first means the app is
 * fully usable with no server, so a build without Supabase credentials runs normally and
 * simply cannot sync. See ADR-002.
 */
export const supabaseConfig: SupabaseConfig | null = (() => {
  const url = present(rawSupabaseUrl);
  const anonKey = present(rawSupabaseAnonKey);

  if (url === null && anonKey === null) return null;

  // Half-configured is always a mistake, and one that would otherwise surface much later as a
  // confusing runtime failure.
  if (url === null || anonKey === null) {
    throw new ConfigError(
      'Supabase is partially configured. Set both EXPO_PUBLIC_SUPABASE_URL and ' +
        'EXPO_PUBLIC_SUPABASE_ANON_KEY, or neither. See .env.example.',
    );
  }

  if (!/^https:\/\/[^\s]+$/.test(url)) {
    throw new ConfigError(`EXPO_PUBLIC_SUPABASE_URL must be an https URL, received: ${url}`);
  }

  return { url, anonKey };
})();

export function isSyncConfigured(): boolean {
  return supabaseConfig !== null;
}

/** Supabase configuration, throwing if absent. For callers that cannot proceed without it. */
export function requireSupabaseConfig(): SupabaseConfig {
  if (supabaseConfig === null) {
    throw new ConfigError(
      'Sync requires Supabase configuration, which this build does not have. See .env.example.',
    );
  }
  return supabaseConfig;
}
