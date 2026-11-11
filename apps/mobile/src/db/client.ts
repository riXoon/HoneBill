// The driver alone: the package index also pulls in `useLiveQuery` (React + change listener), which we do not use.
import { drizzle, type ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite/driver';
import { openDatabaseSync } from 'expo-sqlite';

import { migrate } from './migrations';
import * as schema from './schema';

/**
 * The app's SQLite database through Drizzle (ported from `_legacy/db/client.ts`). Opened and migrated on first use,
 * not at startup, so it costs nothing until a signed-in screen needs its data. The driver is synchronous over JSI;
 * keep each call to small, indexed reads and writes.
 */
export type Database = ExpoSQLiteDatabase<typeof schema>;

const FILE_NAME = 'honebill.db';

let instance: Database | null = null;

export function getDb(): Database {
  if (!instance) {
    const sqlite = openDatabaseSync(FILE_NAME);
    // WAL lets a read run while a write is in progress, and makes each commit cheaper.
    sqlite.execSync('PRAGMA journal_mode = WAL');
    migrate(sqlite);
    instance = drizzle(sqlite, { schema });
  }
  return instance;
}
