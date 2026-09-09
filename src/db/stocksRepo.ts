import { getDatabase } from './database';
import { Stock } from '../domain/types';
import { BIST_STOCKS } from '../data/bistStocks';

export async function seedStocksIfEmpty(): Promise<void> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM stocks');
  if (row && row.count > 0) return;
  for (const s of BIST_STOCKS) {
    await db.runAsync(
      'INSERT OR IGNORE INTO stocks (symbol, name, is_custom) VALUES (?, ?, 0)',
      s.symbol,
      s.name
    );
  }
}

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
  await db.runAsync('DELETE FROM stocks WHERE id = ?', id);
}
