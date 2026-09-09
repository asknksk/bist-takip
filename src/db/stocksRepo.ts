import { getDatabase } from './database';
import { Stock } from '../domain/types';

// Seeding of the initial BIST stock list now happens automatically inside
// getDatabase() in ./database.ts (to avoid a circular import between this
// file and database.ts). No screen needs to call a seeding function.

export async function getAllStocks(): Promise<Stock[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ id: number; symbol: string; name: string; is_custom: number }>(
    'SELECT id, symbol, name, is_custom FROM stocks ORDER BY symbol ASC'
  );
  return rows.map((r) => ({ id: r.id, symbol: r.symbol, name: r.name, isCustom: !!r.is_custom }));
}

export async function addCustomStock(symbol: string, name: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'INSERT INTO stocks (symbol, name, is_custom) VALUES (?, ?, 1)',
    symbol.toUpperCase(),
    name
  );
}

export async function deleteStock(id: number): Promise<void> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM transactions WHERE stock_id = ?',
    id
  );
  if (row && row.count > 0) {
    throw new Error('Bu hissede kayıtlı işlemler var, önce onları silin.');
  }
  await db.runAsync('DELETE FROM stocks WHERE id = ?', id);
}

/**
 * Deletes a stock AND all of its transactions. Unlike deleteStock, this
 * does not block when transactions exist — used for an explicit "remove
 * this stock entirely" action (e.g. a mistakenly added/imported stock)
 * where the user has already confirmed the transaction loss.
 */
export async function forceDeleteStock(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM transactions WHERE stock_id = ?', id);
  await db.runAsync('DELETE FROM stocks WHERE id = ?', id);
}

/**
 * Wipes every transaction and every custom (user-added) stock, leaving the
 * built-in BIST stock list in place so the app is immediately usable again —
 * a full "start over" reset, not a partial one.
 */
export async function resetAllData(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM transactions');
  await db.runAsync('DELETE FROM stocks WHERE is_custom = 1');
}
