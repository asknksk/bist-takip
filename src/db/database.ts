import * as SQLite from 'expo-sqlite';
import { BIST_STOCKS } from '../data/bistStocks';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync('hisse_takip.db')
      .then(async (db) => {
        await db.execAsync(`
          PRAGMA journal_mode = WAL;
          CREATE TABLE IF NOT EXISTS stocks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            is_custom INTEGER NOT NULL DEFAULT 0
          );
          CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            stock_id INTEGER NOT NULL REFERENCES stocks(id),
            type TEXT NOT NULL CHECK (type IN ('buy','sell')),
            quantity REAL NOT NULL,
            price REAL NOT NULL,
            date TEXT NOT NULL
          );
        `);

        // Migration: transactions originally had no time-of-day, so same-day
        // trades were ordered by insertion id — wrong whenever a trade was
        // entered out of order (e.g. a sell logged before its earlier same-day
        // buy). Add an explicit "time" column so ordering reflects what the
        // user says happened, not what order they typed it in.
        const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(transactions)');
        if (!columns.some((c) => c.name === 'time')) {
          await db.execAsync("ALTER TABLE transactions ADD COLUMN time TEXT NOT NULL DEFAULT '00:00'");
        }

        // Always run (not gated on an empty check): INSERT OR IGNORE is a
        // no-op for symbols already present, so this is cheap and also
        // backfills any stocks added to BIST_STOCKS after a device already
        // seeded an earlier, shorter version of the list.
        for (const s of BIST_STOCKS) {
          await db.runAsync(
            'INSERT OR IGNORE INTO stocks (symbol, name, is_custom) VALUES (?, ?, 0)',
            s.symbol,
            s.name
          );
        }

        return db;
      })
      .catch((err) => {
        dbPromise = null;
        throw err;
      });
  }
  return dbPromise;
}
