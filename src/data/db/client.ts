import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';

import * as schema from './schema';

export const DATABASE_NAME = 'ind.db';

/**
 * The local database. This is the source of truth, not a cache. See ADR-002.
 *
 * `enableChangeListener` is what makes Drizzle's `useLiveQuery` reactive: queries re-render
 * when rows change, including rows written by the sync engine, which is why the app needs no
 * server-state cache. See ADR-014.
 */
const sqlite = openDatabaseSync(DATABASE_NAME, { enableChangeListener: true });

// WAL lets reads proceed during a write, which matters because sync writes in the background
// while the user is reading their own data.
sqlite.execSync('PRAGMA journal_mode = WAL;');
// SQLite leaves foreign keys off by default; without this the references in schema.ts would
// be documentation rather than constraints.
sqlite.execSync('PRAGMA foreign_keys = ON;');

export const db = drizzle(sqlite, { schema });

export type Database = typeof db;
export { sqlite };
