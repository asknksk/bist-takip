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

        const row = await db.getFirstAsync<{ count: number }>(
          'SELECT COUNT(*) as count FROM stocks'
        );
        if (!row || row.count === 0) {
          for (const s of BIST_STOCKS) {
            await db.runAsync(
              'INSERT OR IGNORE INTO stocks (symbol, name, is_custom) VALUES (?, ?, 0)',
              s.symbol,
              s.name
            );
          }
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
